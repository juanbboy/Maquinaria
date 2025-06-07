// Acceso a las variables de entorno del Service Account desde process.env

const serviceAccount = {
    type: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_TYPE,
    project_id: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_PROJECT_ID,
    private_key_id: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
    private_key: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY,
    client_email: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL,
    client_id: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_CLIENT_ID,
    auth_uri: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_AUTH_URI,
    token_uri: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL,
    universe_domain: process.env.REACT_APP_FIREBASE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN,
};

module.exports = serviceAccount;
