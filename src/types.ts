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

export interface KeapClientConfig {
  clientId?: string;
  clientSecret?: string;
  serviceAccountToken?: string;
  environment?: 'development' | 'staging' | 'production';
  allowWrite?: boolean;
  baseUrl?: string;
}

export interface KeapTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface KeapContact {
  id: number;
  email_addresses: Array<{
    email: string;
    field: string;
  }>;
  given_name?: string;
  family_name?: string;
  tag_ids?: number[];
}

export interface KeapTag {
  id: number;
  name: string;
  description?: string;
}

export interface KeapContactTag {
  tag: KeapTag;
  date_applied?: string;
}

export interface KeapProduct {
  id: number;
  product_name: string;
  product_price: number;
  product_status: string;
  product_desc?: string;
  sku?: string;
}

export interface UserEntitlement {
  contactId: number;
  email: string;
  name: string;
  tags: string[];
  products?: KeapProduct[];
  rawTags?: KeapContactTag[];
}

export interface BatchEntitlementRequest {
  emails: string[];
}

export interface BatchEntitlementResponse {
  results: Array<{
    email: string;
    entitlements: UserEntitlement | null;
    error?: string;
  }>;
  summary: {
    total: number;
    found: number;
    errors: number;
  };
}

export interface AllEntitlementsResponse {
  entitlements: UserEntitlement[];
  summary: {
    totalContacts: number;
    contactsWithTags: number;
    totalUniqueEntitlements: number;
  };
  availableEntitlements: string[];
}