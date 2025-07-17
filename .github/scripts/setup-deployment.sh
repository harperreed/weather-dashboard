#!/bin/bash

# ABOUTME: Setup script for Fly.io deployment workflows
# ABOUTME: Automates token generation and provides setup instructions

set -e

echo "🚀 Fly.io Deployment Setup Script"
echo "=================================="

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ flyctl is not installed. Please install it first:"
    echo "   https://fly.io/docs/getting-started/installing-flyctl/"
    exit 1
fi

# Check if user is authenticated
if ! flyctl auth whoami &> /dev/null; then
    echo "❌ You're not authenticated with Fly.io. Please run:"
    echo "   flyctl auth login"
    exit 1
fi

echo "✅ flyctl is installed and authenticated"

# Get current user info
USER_EMAIL=$(flyctl auth whoami)
echo "📧 Authenticated as: $USER_EMAIL"

# Generate API token
echo ""
echo "🔑 Generating API token..."
API_TOKEN=$(flyctl tokens create --name "github-actions-$(date +%Y%m%d)")

if [ -z "$API_TOKEN" ]; then
    echo "❌ Failed to generate API token"
    exit 1
fi

echo "✅ API token generated successfully"

# Display setup instructions
echo ""
echo "📋 Next Steps:"
echo "=============="
echo ""
echo "1. Go to your GitHub repository settings:"
echo "   → Settings → Secrets and variables → Actions"
echo ""
echo "2. Create a new repository secret:"
echo "   Name: FLY_API_TOKEN"
echo "   Value: $API_TOKEN"
echo ""
echo "3. Set up GitHub environments:"
echo "   → Settings → Environments"
echo "   → Create 'preview' and 'production' environments"
echo ""
echo "4. Set up branch protection:"
echo "   → Settings → Branches → Add rule for main branch"
echo "   → Enable 'Require a pull request before merging'"
echo ""
echo "5. Test the setup:"
echo "   → Create a PR to test preview deployment"
echo "   → Merge to main to test production deployment"
echo ""

# Copy token to clipboard if available
if command -v pbcopy &> /dev/null; then
    echo "$API_TOKEN" | pbcopy
    echo "📋 API token copied to clipboard!"
elif command -v xclip &> /dev/null; then
    echo "$API_TOKEN" | xclip -selection clipboard
    echo "📋 API token copied to clipboard!"
else
    echo "💡 Manually copy the token above"
fi

echo ""
echo "📚 For detailed instructions, see: .github/DEPLOYMENT_SETUP.md"
echo "🎉 Setup complete! Happy deploying!"
