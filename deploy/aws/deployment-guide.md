# AWS Deployment Guide — Polymarket AI Trading Platform

## Prerequisites
- AWS CLI configured with appropriate credentials
- Docker installed locally
- An AWS account with ECS, ECR, Secrets Manager, and CloudWatch access

## Step 1: Create ECR Repositories

```bash
aws ecr create-repository --repository-name polymarket-agent --region us-east-1
aws ecr create-repository --repository-name polymarket-risk --region us-east-1
aws ecr create-repository --repository-name polymarket-executor --region us-east-1
```

## Step 2: Store Secrets in AWS Secrets Manager

```bash
# Database URL
aws secretsmanager create-secret \
  --name polymarket/database-url \
  --secret-string "postgresql://user:pass@host:5432/polymarket"

# JWT Secret (service-to-service auth)
aws secretsmanager create-secret \
  --name polymarket/jwt-secret \
  --secret-string "$(openssl rand -hex 32)"

# Wallet Private Key (CRITICAL — handle with extreme care)
aws secretsmanager create-secret \
  --name polymarket/wallet-key \
  --secret-string '{"privateKey":"0x..."}'

# OpenAI API Key
aws secretsmanager create-secret \
  --name polymarket/openai-key \
  --secret-string "sk-..."

# Polymarket API Credentials
aws secretsmanager create-secret \
  --name polymarket/api-key \
  --secret-string "your-api-key"
aws secretsmanager create-secret \
  --name polymarket/api-secret \
  --secret-string "your-api-secret"
aws secretsmanager create-secret \
  --name polymarket/api-passphrase \
  --secret-string "your-passphrase"
```

## Step 3: Create VPC and Networking

```bash
# Create VPC with private subnets
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=polymarket-vpc}]'

# Create private subnets (services run here — no public access)
aws ec2 create-subnet --vpc-id VPC_ID --cidr-block 10.0.1.0/24 --availability-zone us-east-1a
aws ec2 create-subnet --vpc-id VPC_ID --cidr-block 10.0.2.0/24 --availability-zone us-east-1b

# Create NAT Gateway for outbound internet (Polymarket API, Polygon RPC)
# Create security groups allowing only inter-service traffic on ports 3001-3003
```

## Step 4: Create IAM Roles

```bash
# Create ECS execution role with the policy in iam-policies/ecs-execution-role-policy.json
aws iam create-role \
  --role-name polymarket-ecs-execution-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam put-role-policy \
  --role-name polymarket-ecs-execution-role \
  --policy-name secrets-and-logs \
  --policy-document file://deploy/aws/iam-policies/ecs-execution-role-policy.json
```

## Step 5: Build and Push Docker Images

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build and push each service
docker build -f docker/Dockerfile.agent -t ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/polymarket-agent:latest .
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/polymarket-agent:latest

docker build -f docker/Dockerfile.risk -t ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/polymarket-risk:latest .
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/polymarket-risk:latest

docker build -f docker/Dockerfile.executor -t ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/polymarket-executor:latest .
docker push ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/polymarket-executor:latest
```

## Step 6: Create ECS Cluster and Services

```bash
# Create cluster
aws ecs create-cluster --cluster-name polymarket-cluster

# Register task definitions
aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-definitions/risk-guardian.json
aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-definitions/trade-executor.json
aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-definitions/agent-service.json

# Create services (deploy in order: risk → executor → agent)
aws ecs create-service \
  --cluster polymarket-cluster \
  --service-name risk-guardian \
  --task-definition polymarket-risk-guardian \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[SUBNET_ID],securityGroups=[SG_ID]}"

aws ecs create-service \
  --cluster polymarket-cluster \
  --service-name trade-executor \
  --task-definition polymarket-trade-executor \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[SUBNET_ID],securityGroups=[SG_ID]}"

aws ecs create-service \
  --cluster polymarket-cluster \
  --service-name agent-service \
  --task-definition polymarket-agent-service \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[SUBNET_ID],securityGroups=[SG_ID]}"
```

## Step 7: Set Up CloudWatch Alarms

```bash
# Create alarm for kill switch events
aws cloudwatch put-metric-alarm \
  --alarm-name polymarket-kill-switch \
  --metric-name ErrorCount \
  --namespace ECS/polymarket \
  --statistic Sum \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:polymarket-alerts
```

## Step 8: Run Database Migrations

```bash
# From your local machine or a bastion host with database access
DATABASE_URL=<production-database-url> npx prisma migrate deploy --schema shared-lib/prisma/schema.prisma
```

## Security Checklist
- [ ] VPC private subnets only (no public IPs on services)
- [ ] Security groups restrict traffic to inter-service ports only
- [ ] Secrets Manager used for all credentials
- [ ] IAM roles follow least privilege
- [ ] CloudWatch logging enabled on all services
- [ ] Kill switch alarm configured
- [ ] Wallet keys NEVER logged anywhere
