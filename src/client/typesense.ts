import Typesense, { Client} from 'typesense';

let typesenseInstance: Client | null = null;

export const getTypesenseClient = () => {
  if (!typesenseInstance) {
    typesenseInstance = new Typesense.Client({
      nodes: [{
        host: process.env.NEXT_PUBLIC_TYPESENSE_HOST || 'localhost',
        port: 443,
        protocol: 'https'
      }],
      apiKey: process.env.NEXT_PUBLIC_TYPESENSE_API_KEY || '',
      connectionTimeoutSeconds: 2
    });
  }
  return typesenseInstance;
};
