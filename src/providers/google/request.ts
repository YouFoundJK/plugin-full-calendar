/**
 * @file request.ts
 * @brief Provides a wrapper for making authenticated requests to the Google Calendar API.
 *
 * @description
 * This module abstracts the process of making a Google API call by automatically
 * handling token acquisition and renewal. It uses the `getGoogleAuthToken` function
 * and Obsidian's `requestUrl` to perform the request.
 *
 * @license See LICENSE.md
 */

import { requestUrl } from 'obsidian';

/**
 * A custom error class for Google API requests to provide more context.
 */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: any
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

/**
 * Makes an authenticated request to a Google API endpoint using a provided token.
 *
 * @param token The OAuth 2.0 access token.
 * @param url The full URL of the API endpoint.
 * @param method The HTTP method ('GET', 'POST', etc.).
 * @param body The request body for POST/PUT requests.
 * @returns The JSON response from the API.
 * @throws {GoogleApiError} If the request fails.
 */
export async function makeAuthenticatedRequest(
  token: string,
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: object
): Promise<any> {
  try {
    const response = await requestUrl({
      url,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 204) {
      // Successful request with no content (e.g., a DELETE request).
      // Return a truthy value to indicate success without trying to parse JSON.
      return true;
    }

    return response.json;
  } catch (e: any) {
    console.error('Google API Request Failed:', {
      url,
      status: e.status,
      response: e.body
    });

    let message = 'Google API request failed.';
    if (e.status) {
      message += ` Status: ${e.status}`;
    }

    throw new GoogleApiError(message, e.status, e.body);
  }
}
