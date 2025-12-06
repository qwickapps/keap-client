/**
 * @qwickapps/keap-client
 *
 * Copyright (c) QwickApps (Raajkumar Enterprises, LLC). All rights reserved.
 * Licensed under the PolyForm Shield License 1.0.0
 * See LICENSE file for details.
 *
 * https://github.com/qwickapps/keap-client
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