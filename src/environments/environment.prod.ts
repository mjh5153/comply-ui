export const environment = {
  production: true,

  // Empty means "same origin". Leave it empty when the BFF serves the built
  // Angular app, which keeps the browser on one origin and avoids CORS.
  //
  // Only set an absolute URL when the UI is deployed to a different origin
  // from the BFF, e.g. 'https://comply-bff.onrender.com'. Doing so also
  // requires that origin to be listed in the BFF's CORS_ALLOWED_ORIGINS.
  apiBaseUrl: ''
};
