# @t3live/keap-client

A simplified Keap CRM client for fetching user entitlements using app-level authentication. Designed for serverless environments like Auth0 Actions where persistent storage and OAuth flows are not practical.

## Features

- **App-level Authentication**: Uses client credentials flow (no user OAuth required)
- **Stateless Design**: No persistent storage needed
- **Automatic Token Refresh**: Handles token expiry transparently
- **Batch Operations**: Fetch entitlements for multiple users efficiently
- **Environment Safety**: Production mode prevents write operations
- **TypeScript Support**: Full type definitions included

## Installation

```bash
npm install @t3live/keap-client
```

## Basic Usage

```typescript
import { KeapClient } from '@t3live/keap-client';

const client = new KeapClient({
  clientId: 'your-keap-client-id',
  clientSecret: 'your-keap-client-secret',
  environment: 'production' // 'development' | 'staging' | 'production'
});

// Get entitlements for a single user
const entitlements = await client.getUserEntitlements('user@example.com');

if (entitlements) {
  console.info('User entitlements:', entitlements.tags);
  console.info('Contact ID:', entitlements.contactId);
  console.info('Full name:', entitlements.name);
} else {
  console.info('User not found in Keap');
}
```

## Auth0 Post-Login Action Example

```typescript
// Auth0 Action
exports.onExecutePostLogin = async (event, api) => {
  const { KeapClient } = require('@t3live/keap-client');

  const keap = new KeapClient({
    clientId: event.secrets.KEAP_CLIENT_ID,
    clientSecret: event.secrets.KEAP_CLIENT_SECRET,
    environment: 'production'
  });

  try {
    const entitlements = await keap.getUserEntitlements(event.user.email);

    if (entitlements && entitlements.tags.length > 0) {
      // Store entitlements in user metadata
      api.user.setUserMetadata('keap_entitlements', entitlements.tags);
      api.user.setUserMetadata('keap_contact_id', entitlements.contactId);
      api.user.setUserMetadata('keap_last_sync', new Date().toISOString());

      console.info(`Synced ${entitlements.tags.length} entitlements for ${event.user.email}`);
    }
  } catch (error) {
    // Don't block login on Keap errors
    console.error('Keap sync failed (non-blocking):', error.message);
  }
};
```

## Batch Operations

```typescript
// Fetch entitlements for multiple users
const result = await client.getBatchEntitlements({
  emails: [
    'user1@example.com',
    'user2@example.com',
    'user3@example.com'
  ]
});

console.info(`Processed ${result.summary.total} users`);
console.info(`Found ${result.summary.found} contacts`);
console.info(`Errors: ${result.summary.errors}`);

result.results.forEach(({ email, entitlements, error }) => {
  if (entitlements) {
    console.info(`${email}: ${entitlements.tags.join(', ')}`);
  } else if (error) {
    console.error(`${email}: ${error}`);
  } else {
    console.info(`${email}: Not found`);
  }
});
```

## Configuration Options

```typescript
interface KeapClientConfig {
  clientId: string;           // Keap app client ID
  clientSecret: string;       // Keap app client secret
  environment?: string;       // 'development' | 'staging' | 'production'
  allowWrite?: boolean;       // Enable write operations (default: false)
  baseUrl?: string;          // Custom API base URL
}
```

## Response Types

```typescript
interface UserEntitlement {
  contactId: number;          // Keap contact ID
  email: string;             // User email address
  name: string;              // Full name from Keap
  tags: string[];            // Array of tag names (entitlements)
  rawTags?: KeapContactTag[]; // Full tag objects with metadata
}

interface BatchEntitlementResponse {
  results: Array<{
    email: string;
    entitlements: UserEntitlement | null;
    error?: string;
  }>;
  summary: {
    total: number;    // Total emails processed
    found: number;    // Contacts found
    errors: number;   // Errors encountered
  };
}
```

## Environment Setup

### Keap Configuration

1. Create a Keap application in the [Keap Developer Portal](https://keys.developer.keap.com/)
2. Note your Client ID and Client Secret
3. Ensure your app has appropriate read permissions

### For Auth0 Actions

1. Add secrets in Auth0 Dashboard:
   - `KEAP_CLIENT_ID`: Your Keap client ID
   - `KEAP_CLIENT_SECRET`: Your Keap client secret

2. Install the dependency in your Action:
   ```json
   {
     "dependencies": {
       "@t3live/keap-client": "^1.0.0"
     }
   }
   ```

## Error Handling

The client handles common scenarios gracefully:

- **Authentication failures**: Throws clear error messages
- **Network timeouts**: Built-in retry logic for token refresh
- **User not found**: Returns `null` instead of throwing
- **API rate limits**: Respects Keap's rate limiting
- **Invalid responses**: Validates API responses and provides meaningful errors

```typescript
try {
  const entitlements = await client.getUserEntitlements('user@example.com');
  // Handle success
} catch (error) {
  if (error.message.includes('Authentication failed')) {
    console.error('Invalid Keap credentials');
  } else if (error.message.includes('rate limit')) {
    console.warn('Rate limited - retry later');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

## Development

### Testing

```bash
# Run unit tests with mocks
npm run test:unit

# Run validation tests with live API (requires .env.test)
npm run test:validation

# Run all tests
npm test
```

### Environment Variables for Testing

Create `.env.test`:
```bash
KEAP_CLIENT_ID=your-test-client-id
KEAP_SECRET=your-test-client-secret
TEST_USER_EMAIL=test@example.com
NODE_ENV=test
ALLOW_WRITE=false
```

## Security Notes

- **Production Safety**: Write operations are automatically disabled in production
- **Credential Management**: Never commit credentials to version control
- **Minimal Scope**: Client only requests necessary read permissions
- **Error Isolation**: API failures don't expose sensitive information

## License

This software is proprietary to QwickApps (Raajkumar Enterprises, LLC) and is provided under escrow license for T3Live, LLC.

## Support

For technical support and bug reports, contact QwickApps support.