# ABOUTME: Setup instructions for Fly.io deployment workflows
# ABOUTME: Contains step-by-step guide for configuring GitHub secrets and environments

# Fly.io Deployment Setup

This document explains how to set up the GitHub Actions workflows for automated deployments to Fly.io.

## Prerequisites

- A Fly.io account with a deployed app
- A GitHub repository with admin access
- The Fly.io CLI installed and authenticated

## GitHub Secrets Setup

### 1. Get your Fly.io API Token

Run this command to get your API token:

```bash
flyctl auth token
```

Copy the token that starts with `fm2_` or `fo1_`.

### 2. Configure GitHub Secrets

Go to your GitHub repository settings:

1. Navigate to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the following secret:

| Name | Value |
|------|-------|
| `FLY_API_TOKEN` | Your Fly.io API token from step 1 |

### 3. Set up GitHub Environments

Create two environments for deployment protection:

#### Preview Environment
1. Go to **Settings** → **Environments**
2. Click **New environment**
3. Name it `preview`
4. (Optional) Add environment protection rules:
   - Required reviewers: Add team members who should review preview deployments
   - Deployment branches: Select "All branches" to allow preview deployments from any branch

#### Production Environment
1. Click **New environment**
2. Name it `production`
3. Add environment protection rules:
   - **Required reviewers**: Add at least one team member
   - **Deployment branches**: Select "Protected branches only" and ensure your main branch is protected

## How the Workflows Work

### PR Preview Workflow (`fly-pr-preview.yml`)

**Triggers:**
- When a PR is opened, updated, or reopened
- When a PR is closed (for cleanup)

**What it does:**
1. Creates a unique preview app name: `weather-dashboard-pr-{number}`
2. Deploys your changes to a temporary Fly.io app
3. Comments on the PR with the preview URL
4. Destroys the preview app when the PR is closed

**Example preview URL:** `https://weather-dashboard-pr-123.fly.dev`

### Production Deployment Workflow (`fly-deploy-prod.yml`)

**Triggers:**
- When changes are pushed to the main branch
- Manual trigger from GitHub Actions tab

**What it does:**
1. Deploys to the production app: `weather-dashboard`
2. Verifies the deployment is healthy
3. Creates a GitHub issue if deployment fails

## Branch Protection Setup

To ensure the production workflow only runs after review:

1. Go to **Settings** → **Branches**
2. Click **Add rule** for your main branch
3. Enable:
   - **Require a pull request before merging**
   - **Require status checks to pass before merging**
   - **Require conversation resolution before merging**

## Testing the Setup

### Test PR Preview
1. Create a new branch: `git checkout -b test-preview`
2. Make a small change to your code
3. Push the branch: `git push origin test-preview`
4. Create a PR from the branch
5. Watch the GitHub Actions run and check for the preview URL comment

### Test Production Deployment
1. Merge the PR to main
2. Watch the production deployment workflow run
3. Verify the changes are live at `https://weather-dashboard.fly.dev`

## Troubleshooting

### Common Issues

**"App not found" error:**
- Ensure your production app name matches exactly: `weather-dashboard`
- Check that your Fly.io API token has access to the app

**"Authentication failed" error:**
- Verify your `FLY_API_TOKEN` secret is set correctly
- Generate a new token with: `flyctl tokens create`

**Preview app creation fails:**
- Check that your Fly.io organization has sufficient resources
- Ensure the app name isn't already taken

**SSL certificate issues:**
- Preview apps may take a few minutes to get SSL certificates
- Production app should already have certificates configured

### Viewing Logs

- **GitHub Actions logs**: Go to the Actions tab in your repository
- **Fly.io app logs**: Run `flyctl logs -a APP_NAME` or use the Fly.io dashboard

## Customization

### Environment Variables

Add environment-specific variables in the workflow files:

```yaml
env:
  CUSTOM_VAR: "production-value"
```

### Resource Scaling

Modify the VM configuration in the workflow:

```yaml
[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512  # Increase memory
```

### Custom Domains

For preview apps with custom domains, add domain configuration to the workflow.

## Security Notes

- Never commit your Fly.io API token to the repository
- Use environment protection rules to control who can deploy to production
- Regularly rotate your API tokens
- Monitor deployment logs for any security issues

## Support

If you encounter issues:
1. Check the GitHub Actions logs
2. Review Fly.io documentation: https://fly.io/docs/
3. Check Fly.io status page: https://status.flyio.net/
