/**
 * Handgepflegte Typen für die Supabase-Tabellen.
 * Passend zur Migration in /supabase/schema.sql.
 *
 * Hinweis: Wer mag, kann diese Datei später per
 *   npx supabase gen types typescript --project-id <id> > lib/database.types.ts
 * automatisch generieren lassen.
 */

export type Database = {
  public: {
    Tables: {
      athletes: {
        Row: {
          id: string;
          code: string;
          full_name: string;
          position: string | null;
          sport: string | null;
          birth_date: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          full_name: string;
          position?: string | null;
          sport?: string | null;
          birth_date?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['athletes']['Insert']>;
        Relationships: [];
      };
      metrics: {
        Row: {
          id: string;
          key: string;
          label: string;
          category: string;
          unit: string;
          higher_is_better: boolean;
          sort_order: number;
          is_custom: boolean;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          label: string;
          category: string;
          unit: string;
          higher_is_better: boolean;
          sort_order?: number;
          is_custom?: boolean;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['metrics']['Insert']>;
        Relationships: [];
      };
      measurements: {
        Row: {
          id: string;
          athlete_id: string;
          metric_id: string;
          value: number;
          reps: number | null;
          weight: number | null;
          /** Seite bei Richtungswechsel-Tests; null = ohne Seite. */
          side: 'left' | 'right' | null;
          tested_at: string;
          entered_by: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          athlete_id: string;
          metric_id: string;
          value: number;
          reps?: number | null;
          weight?: number | null;
          side?: 'left' | 'right' | null;
          tested_at?: string;
          entered_by?: string;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['measurements']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id: string;
          athlete_id: string | null;
          role: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          athlete_id?: string | null;
          role: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_coach: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      current_athlete_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// Bequeme Aliase
export type AthleteRow = Database['public']['Tables']['athletes']['Row'];
export type MetricRow = Database['public']['Tables']['metrics']['Row'];
export type MeasurementRow = Database['public']['Tables']['measurements']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
