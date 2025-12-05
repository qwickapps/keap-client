/**
 * Copyright (c) QwickApps (Raajkumar Enterprises, LLC). All rights reserved.
 *
 * This file is made available under an escrow license for evaluation purposes only.
 * The intellectual property rights will be transferred to T3Live, LLC upon full payment of the invoice.
 *
 * Until payment is received in full, no part of this file may be distributed, modified, or used
 * for production deployment without explicit written permission from QwickApps (Raajkumar Enterprises, LLC).
 *
 * Unauthorized use, distribution, or modification of this code is strictly prohibited.
 */

import {
  KeapClientConfig,
  KeapTokenResponse,
  KeapContact,
  KeapContactTag,
  UserEntitlement,
  BatchEntitlementRequest,
  BatchEntitlementResponse,
  AllEntitlementsResponse
} from './types.js';

/**
 * Simplified Keap CRM client for app-level entitlement fetching.
 *
 * This client uses app-level credentials to fetch user entitlements without
 * requiring user-specific OAuth flows or persistent storage.
 *
 * Features:
 * - App-level authentication using client credentials
 * - Automatic token refresh
 * - Batch entitlement fetching
 * - Read-only mode protection
 * - Comprehensive error handling
 */
export class KeapClient {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly config: KeapClientConfig & {
    environment: 'development' | 'staging' | 'production';
    allowWrite: boolean;
    baseUrl: string;
  };

  constructor(config: KeapClientConfig) {
    this.config = {
      environment: 'production',
      allowWrite: false,
      baseUrl: 'https://api.infusionsoft.com/crm/rest/v1',
      ...config
    };

    // Production is always read-only for safety
    if (this.config.environment === 'production') {
      this.config.allowWrite = false;
    }

    // Validate configuration
    if (!this.config.serviceAccountToken && (!this.config.clientId || !this.config.clientSecret)) {
      throw new Error('Either serviceAccountToken or both clientId and clientSecret must be provided');
    }

    // If service account token is provided, use it directly
    if (this.config.serviceAccountToken) {
      this.accessToken = this.config.serviceAccountToken;
      // Service account tokens don't expire, so set a far future date
      this.tokenExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    }
  }

  /**
   * Get user entitlements by email address
   */
  async getUserEntitlements(email: string): Promise<UserEntitlement | null> {
    await this.ensureAuthenticated();

    try {
      const contact = await this.findContactByEmail(email);
      if (!contact) {
        return null;
      }

      const rawTags = await this.getContactTagsWithDetails(contact.id);
      const tags = rawTags.map(tagData => tagData.tag.name);

      return {
        contactId: contact.id,
        email,
        name: this.formatContactName(contact),
        tags,
        rawTags
      };
    } catch (error) {
      console.error(`Error getting entitlements for ${email}:`, error);
      throw error;
    }
  }

  /**
   * Get contact by ID
   */
  async getContactById(contactId: number): Promise<KeapContact | null> {
    await this.ensureAuthenticated();

    try {
      const response = await this.makeAuthenticatedRequest(`/contacts/${contactId}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to get contact: ${response.status}`);
      }
      return response.json();
    } catch (error) {
      console.error(`Error getting contact ${contactId}:`, error);
      return null;
    }
  }

  /**
   * Get entitlements for multiple users in batch
   */
  async getBatchEntitlements(request: BatchEntitlementRequest): Promise<BatchEntitlementResponse> {
    const results: BatchEntitlementResponse['results'] = [];
    let found = 0;
    let errors = 0;

    for (const email of request.emails) {
      try {
        const entitlements = await this.getUserEntitlements(email);
        results.push({
          email,
          entitlements
        });
        if (entitlements) found++;
      } catch (error) {
        results.push({
          email,
          entitlements: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        errors++;
      }
    }

    return {
      results,
      summary: {
        total: request.emails.length,
        found,
        errors
      }
    };
  }

  /**
   * Get all entitlements for all contacts in the Keap system
   * This can be resource-intensive for large contact databases
   */
  async getAllEntitlements(options: {
    limit?: number;
    includeContactsWithoutTags?: boolean;
  } = {}): Promise<AllEntitlementsResponse> {
    await this.ensureAuthenticated();

    const { limit = 100, includeContactsWithoutTags = false } = options;
    const entitlements: UserEntitlement[] = [];
    const allEntitlementNames = new Set<string>();
    let contactsWithTags = 0;

    try {
      // Get all contacts
      const contacts = await this.getAllContacts(limit);
      console.info(`Retrieved ${contacts.length} contacts from Keap`);

      // Fetch entitlements for each contact
      for (const contact of contacts) {
        try {
          const email = this.extractPrimaryEmail(contact);
          if (!email) continue;

          const rawTags = await this.getContactTagsWithDetails(contact.id);
          const tags = rawTags.map(tagData => tagData.tag.name);

          // Track unique entitlements
          tags.forEach(tag => allEntitlementNames.add(tag));

          if (tags.length > 0 || includeContactsWithoutTags) {
            entitlements.push({
              contactId: contact.id,
              email,
              name: this.formatContactName(contact),
              tags,
              rawTags
            });

            if (tags.length > 0) {
              contactsWithTags++;
            }
          }
        } catch (error) {
          console.warn(`Failed to get entitlements for contact ${contact.id}:`, error);
        }
      }

      return {
        entitlements,
        summary: {
          totalContacts: contacts.length,
          contactsWithTags,
          totalUniqueEntitlements: allEntitlementNames.size
        },
        availableEntitlements: Array.from(allEntitlementNames).sort()
      };

    } catch (error) {
      console.error('Error getting all entitlements:', error);
      throw error;
    }
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken && !this.isTokenExpired();
  }

  /**
   * Get client status for debugging
   */
  getStatus() {
    return {
      authenticated: this.isAuthenticated(),
      environment: this.config.environment,
      readOnlyMode: !this.config.allowWrite,
      tokenExpiry: this.tokenExpiry?.toISOString(),
      baseUrl: this.config.baseUrl
    };
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    // If using service account token, no need to authenticate
    if (this.config.serviceAccountToken) {
      return;
    }

    if (!this.accessToken || this.isTokenExpired()) {
      await this.authenticateApp();
    }
  }

  /**
   * Authenticate using app-level client credentials
   */
  private async authenticateApp(): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('Client ID and secret are required for OAuth authentication');
    }

    try {
      const response = await this.makeRequest('https://api.infusionsoft.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope: 'full' // Using full scope for app-level access
        }).toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Authentication failed: ${response.status} ${errorText}`);
      }

      const tokenData: KeapTokenResponse = await response.json();
      this.accessToken = tokenData.access_token;
      this.tokenExpiry = new Date(Date.now() + (tokenData.expires_in * 1000));

      console.info(`Keap authenticated successfully (expires in ${tokenData.expires_in}s)`);
    } catch (error) {
      console.error('Keap authentication failed:', error);
      throw error;
    }
  }

  /**
   * Check if current token is expired
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true;
    // Consider expired if expires in next 5 minutes
    const bufferTime = 5 * 60 * 1000;
    return this.tokenExpiry.getTime() <= (Date.now() + bufferTime);
  }

  /**
   * Find contact by email address
   */
  private async findContactByEmail(email: string): Promise<KeapContact | null> {
    const response = await this.makeAuthenticatedRequest('/contacts', {
      method: 'GET',
      searchParams: {
        email: email,
        limit: '1'
      }
    });

    const data = await response.json();
    const contacts = data.contacts;
    return contacts && contacts.length > 0 ? contacts[0] : null;
  }

  /**
   * Get contact's tags with full details
   */
  private async getContactTagsWithDetails(contactId: number): Promise<KeapContactTag[]> {
    try {
      const response = await this.makeAuthenticatedRequest(`/contacts/${contactId}/tags`);
      const data = await response.json();
      return data.tags || [];
    } catch (error) {
      console.warn(`Failed to get tags for contact ${contactId}:`, error);
      return [];
    }
  }

  /**
   * Get contacts from Keap with pagination support
   * This is the public method for fetching contacts that can be used by user sync.
   */
  async getContacts(options: {
    limit?: number;
    offset?: number;
    order?: 'date_created' | 'email' | 'name';
    orderDirection?: 'ascending' | 'descending';
    includeTagIds?: boolean;
  } = {}): Promise<{ contacts: KeapContact[]; count: number; next?: string }> {
    await this.ensureAuthenticated();

    const { limit = 200, offset = 0, order = 'date_created', orderDirection = 'descending', includeTagIds = false } = options;

    const searchParams: Record<string, string> = {
      limit: limit.toString(),
      offset: offset.toString(),
      order,
      order_direction: orderDirection
    };

    // Include tag_ids in response to avoid separate API calls per contact
    if (includeTagIds) {
      searchParams.optional_properties = 'tag_ids';
    }

    const response = await this.makeAuthenticatedRequest('/contacts', {
      method: 'GET',
      searchParams
    });

    const data = await response.json();
    return {
      contacts: data.contacts || [],
      count: data.count || (data.contacts?.length ?? 0),
      next: data.next
    };
  }

  /**
   * Get all tags from Keap (for mapping tag_ids to names)
   */
  async getAllTags(): Promise<Map<number, string>> {
    await this.ensureAuthenticated();

    const tagMap = new Map<number, string>();
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const response = await this.makeAuthenticatedRequest('/tags', {
        method: 'GET',
        searchParams: {
          limit: limit.toString(),
          offset: offset.toString(),
        }
      });

      const data = await response.json();
      const tags = data.tags || [];

      for (const tag of tags) {
        tagMap.set(tag.id, tag.name);
      }

      offset += tags.length;
      hasMore = tags.length === limit;
    }

    return tagMap;
  }

  /**
   * Get total contact count from Keap
   */
  async getContactCount(): Promise<number> {
    await this.ensureAuthenticated();

    // Fetch with limit=0 to just get count, or use a small limit and check count field
    const response = await this.makeAuthenticatedRequest('/contacts', {
      method: 'GET',
      searchParams: {
        limit: '1',
        offset: '0',
      }
    });

    const data = await response.json();
    // Keap API returns total count in the response
    return data.count || 0;
  }

  /**
   * Fetch all contacts from Keap using pagination
   * Yields contacts in batches for memory-efficient processing
   */
  async *fetchAllContactsPaginated(options: {
    batchSize?: number;
    includeTagIds?: boolean;
  } = {}): AsyncGenerator<KeapContact[], void, unknown> {
    const { batchSize = 200, includeTagIds = false } = options;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getContacts({ limit: batchSize, offset, includeTagIds });
      if (result.contacts.length > 0) {
        yield result.contacts;
        offset += result.contacts.length;
      }
      // Continue if we got a full batch (there might be more)
      hasMore = result.contacts.length === batchSize;
    }
  }

  /**
   * Get all contacts from Keap (legacy internal method)
   */
  private async getAllContacts(limit: number): Promise<KeapContact[]> {
    const result = await this.getContacts({ limit });
    return result.contacts;
  }

  /**
   * Extract primary email from contact data
   */
  private extractPrimaryEmail(contact: KeapContact): string | null {
    if (!contact.email_addresses || contact.email_addresses.length === 0) {
      return null;
    }

    // Look for EMAIL1 field first, then any email
    const primaryEmail = contact.email_addresses.find(ea => ea.field === 'EMAIL1');
    if (primaryEmail) {
      return primaryEmail.email;
    }

    // Return first available email
    return contact.email_addresses[0]?.email || null;
  }

  /**
   * Format contact name from contact data
   */
  private formatContactName(contact: KeapContact): string {
    const firstName = contact.given_name || '';
    const lastName = contact.family_name || '';
    return `${firstName} ${lastName}`.trim() || 'Unknown';
  }

  /**
   * Make authenticated API request to Keap
   */
  private async makeAuthenticatedRequest(endpoint: string, options: {
    method?: string;
    searchParams?: Record<string, string>;
    body?: string;
  } = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    let url = `${this.config.baseUrl}${endpoint}`;
    if (options.searchParams) {
      const params = new URLSearchParams(options.searchParams);
      url += `?${params.toString()}`;
    }

    const response = await this.makeRequest(url, {
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: options.body
    });

    if (response.status === 401) {
      // For service account tokens, don't retry - they don't expire
      if (this.config.serviceAccountToken) {
        const errorText = await response.text();
        throw new Error(`Keap API error (service account): ${response.status} ${errorText}`);
      }

      // Token expired, try to refresh and retry
      this.accessToken = null;
      await this.ensureAuthenticated();

      // Retry the request with new token
      return this.makeRequest(url, {
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: options.body
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Keap API error: ${response.status} ${errorText}`);
    }

    return response;
  }

  /**
   * Make HTTP request (abstracted for testing)
   */
  private async makeRequest(url: string, options: RequestInit): Promise<Response> {
    // In Node.js environment, we'll need to use node-fetch
    // This will be handled by the consumer
    if (typeof fetch === 'undefined') {
      throw new Error('fetch is not available. Please provide a fetch implementation or use in a browser environment.');
    }

    return fetch(url, options);
  }
}