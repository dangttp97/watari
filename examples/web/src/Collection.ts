export type SchemaPropertyType =
  'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

export type SchemaProperty = {
  type: SchemaPropertyType | (string & {});
  description?: string;
};

export type CollectionSchema = {
  type: 'object' | (string & {});
  required: string[];
  properties: Record<string, SchemaProperty>;
};

export type CollectionVisibility = 'private' | 'public' | (string & {});

export type Collection = {
  id: string;
  project_id: number;
  user_id: number;
  name: string;
  slug: string;
  schema: CollectionSchema;
  visibility: CollectionVisibility;
  created_at: string;
  updated_at: string;
};
