export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      alerts: {
        Row: {
          body: string | null;
          candidate_id: string | null;
          created_at: string;
          id: string;
          read: boolean;
          title: string;
        };
        Insert: {
          body?: string | null;
          candidate_id?: string | null;
          created_at?: string;
          id?: string;
          read?: boolean;
          title: string;
        };
        Update: {
          body?: string | null;
          candidate_id?: string | null;
          created_at?: string;
          id?: string;
          read?: boolean;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_types: {
        Row: {
          active: boolean;
          code: string;
          description: string | null;
          duration_minutes: number;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          description?: string | null;
          duration_minutes: number;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          description?: string | null;
          duration_minutes?: number;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          application_code: string | null;
          appointment_type: string;
          booked_by: string;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          candidate_email: string;
          candidate_id: string;
          candidate_name: string;
          candidate_notified: boolean;
          candidate_phone: string | null;
          created_at: string;
          duration_minutes: number;
          end_at: string;
          hr_notified: boolean;
          id: string;
          interviewer: string | null;
          job_id: string | null;
          meeting_url: string | null;
          notes: string | null;
          rescheduled_from: string | null;
          rescheduled_to: string | null;
          start_at: string;
          status: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          application_code?: string | null;
          appointment_type: string;
          booked_by?: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          candidate_email: string;
          candidate_id: string;
          candidate_name: string;
          candidate_notified?: boolean;
          candidate_phone?: string | null;
          created_at?: string;
          duration_minutes: number;
          end_at: string;
          hr_notified?: boolean;
          id?: string;
          interviewer?: string | null;
          job_id?: string | null;
          meeting_url?: string | null;
          notes?: string | null;
          rescheduled_from?: string | null;
          rescheduled_to?: string | null;
          start_at: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          application_code?: string | null;
          appointment_type?: string;
          booked_by?: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          candidate_email?: string;
          candidate_id?: string;
          candidate_name?: string;
          candidate_notified?: boolean;
          candidate_phone?: string | null;
          created_at?: string;
          duration_minutes?: number;
          end_at?: string;
          hr_notified?: boolean;
          id?: string;
          interviewer?: string | null;
          job_id?: string | null;
          meeting_url?: string | null;
          notes?: string | null;
          rescheduled_from?: string | null;
          rescheduled_to?: string | null;
          start_at?: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_appointment_type_fkey";
            columns: ["appointment_type"];
            isOneToOne: false;
            referencedRelation: "appointment_types";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "appointments_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_rescheduled_from_fkey";
            columns: ["rescheduled_from"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_rescheduled_to_fkey";
            columns: ["rescheduled_to"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      ats_evaluations: {
        Row: {
          ats_category: string | null;
          ats_score: number | null;
          candidate_id: string;
          created_at: string;
          created_by: string | null;
          error: string | null;
          id: string;
          job_id: string | null;
          result: Json | null;
          scoring_version: string | null;
          status: string;
          summary: string | null;
        };
        Insert: {
          ats_category?: string | null;
          ats_score?: number | null;
          candidate_id: string;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          job_id?: string | null;
          result?: Json | null;
          scoring_version?: string | null;
          status?: string;
          summary?: string | null;
        };
        Update: {
          ats_category?: string | null;
          ats_score?: number | null;
          candidate_id?: string;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          job_id?: string | null;
          result?: Json | null;
          scoring_version?: string | null;
          status?: string;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ats_evaluations_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ats_evaluations_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_documents: {
        Row: {
          candidate_id: string;
          created_at: string;
          doc_type: string;
          file_url: string | null;
          id: string;
          notes: string | null;
          status: string;
          verified_at: string | null;
          verified_by: string | null;
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          doc_type: string;
          file_url?: string | null;
          id?: string;
          notes?: string | null;
          status?: string;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          doc_type?: string;
          file_url?: string | null;
          id?: string;
          notes?: string | null;
          status?: string;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_documents_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidates: {
        Row: {
          application_code: string | null;
          application_status: string;
          applied_role: string | null;
          ats_breakdown: Json | null;
          ats_category: string | null;
          ats_error: string | null;
          ats_gaps: string[];
          ats_score: number | null;
          ats_scored_at: string | null;
          ats_status: string;
          ats_strengths: string[];
          ats_summary: string | null;
          ats_version: string | null;
          auto_shortlisted: boolean;
          cover_letter: string | null;
          created_at: string;
          created_by: string | null;
          education_match: string | null;
          email: string;
          experience_match: string | null;
          filtered_out_at: string | null;
          full_name: string;
          id: string;
          interview_at: string | null;
          interview_confirm_token: string;
          interview_confirmed_at: string | null;
          interview_email_sent_at: string | null;
          interview_email_status: string;
          interview_invited_at: string | null;
          interview_location: string | null;
          interviewer: string | null;
          job_id: string | null;
          keyword_score: number | null;
          linkedin_url: string | null;
          location: string | null;
          matched_preferred_skills: string[];
          matched_required_skills: string[];
          missing_preferred_skills: string[];
          missing_required_skills: string[];
          notes: string | null;
          outcome: string;
          outcome_at: string | null;
          outcome_email_sent_at: string | null;
          outcome_email_status: string;
          outcome_notes: string | null;
          phone: string | null;
          portfolio_url: string | null;
          relevant_experience_years: number | null;
          resume_file_name: string | null;
          resume_file_type: string | null;
          resume_parsed: Json | null;
          resume_path: string | null;
          resume_text: string | null;
          resume_uploaded_at: string | null;
          scoring_version: string | null;
          shortlist_email_sent_at: string | null;
          shortlist_email_status: string;
          shortlisted_at: string | null;
          source: string;
          source_post_id: string | null;
          stage: string;
          total_experience_years: number | null;
          updated_at: string;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          years_experience: number | null;
        };
        Insert: {
          application_code?: string | null;
          application_status?: string;
          applied_role?: string | null;
          ats_breakdown?: Json | null;
          ats_category?: string | null;
          ats_error?: string | null;
          ats_gaps?: string[];
          ats_score?: number | null;
          ats_scored_at?: string | null;
          ats_status?: string;
          ats_strengths?: string[];
          ats_summary?: string | null;
          ats_version?: string | null;
          auto_shortlisted?: boolean;
          cover_letter?: string | null;
          created_at?: string;
          created_by?: string | null;
          education_match?: string | null;
          email: string;
          experience_match?: string | null;
          filtered_out_at?: string | null;
          full_name: string;
          id?: string;
          interview_at?: string | null;
          interview_confirm_token?: string;
          interview_confirmed_at?: string | null;
          interview_email_sent_at?: string | null;
          interview_email_status?: string;
          interview_invited_at?: string | null;
          interview_location?: string | null;
          interviewer?: string | null;
          job_id?: string | null;
          keyword_score?: number | null;
          linkedin_url?: string | null;
          location?: string | null;
          matched_preferred_skills?: string[];
          matched_required_skills?: string[];
          missing_preferred_skills?: string[];
          missing_required_skills?: string[];
          notes?: string | null;
          outcome?: string;
          outcome_at?: string | null;
          outcome_email_sent_at?: string | null;
          outcome_email_status?: string;
          outcome_notes?: string | null;
          phone?: string | null;
          portfolio_url?: string | null;
          relevant_experience_years?: number | null;
          resume_file_name?: string | null;
          resume_file_type?: string | null;
          resume_parsed?: Json | null;
          resume_path?: string | null;
          resume_text?: string | null;
          resume_uploaded_at?: string | null;
          scoring_version?: string | null;
          shortlist_email_sent_at?: string | null;
          shortlist_email_status?: string;
          shortlisted_at?: string | null;
          source?: string;
          source_post_id?: string | null;
          stage?: string;
          total_experience_years?: number | null;
          updated_at?: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          years_experience?: number | null;
        };
        Update: {
          application_code?: string | null;
          application_status?: string;
          applied_role?: string | null;
          ats_breakdown?: Json | null;
          ats_category?: string | null;
          ats_error?: string | null;
          ats_gaps?: string[];
          ats_score?: number | null;
          ats_scored_at?: string | null;
          ats_status?: string;
          ats_strengths?: string[];
          ats_summary?: string | null;
          ats_version?: string | null;
          auto_shortlisted?: boolean;
          cover_letter?: string | null;
          created_at?: string;
          created_by?: string | null;
          education_match?: string | null;
          email?: string;
          experience_match?: string | null;
          filtered_out_at?: string | null;
          full_name?: string;
          id?: string;
          interview_at?: string | null;
          interview_confirm_token?: string;
          interview_confirmed_at?: string | null;
          interview_email_sent_at?: string | null;
          interview_email_status?: string;
          interview_invited_at?: string | null;
          interview_location?: string | null;
          interviewer?: string | null;
          job_id?: string | null;
          keyword_score?: number | null;
          linkedin_url?: string | null;
          location?: string | null;
          matched_preferred_skills?: string[];
          matched_required_skills?: string[];
          missing_preferred_skills?: string[];
          missing_required_skills?: string[];
          notes?: string | null;
          outcome?: string;
          outcome_at?: string | null;
          outcome_email_sent_at?: string | null;
          outcome_email_status?: string;
          outcome_notes?: string | null;
          phone?: string | null;
          portfolio_url?: string | null;
          relevant_experience_years?: number | null;
          resume_file_name?: string | null;
          resume_file_type?: string | null;
          resume_parsed?: Json | null;
          resume_path?: string | null;
          resume_text?: string | null;
          resume_uploaded_at?: string | null;
          scoring_version?: string | null;
          shortlist_email_sent_at?: string | null;
          shortlist_email_status?: string;
          shortlisted_at?: string | null;
          source?: string;
          source_post_id?: string | null;
          stage?: string;
          total_experience_years?: number | null;
          updated_at?: string;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          years_experience?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidates_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      hr_blocked_times: {
        Row: {
          all_day: boolean;
          block_date: string;
          created_at: string;
          created_by: string | null;
          end_time: string | null;
          id: string;
          reason: string | null;
          start_time: string | null;
        };
        Insert: {
          all_day?: boolean;
          block_date: string;
          created_at?: string;
          created_by?: string | null;
          end_time?: string | null;
          id?: string;
          reason?: string | null;
          start_time?: string | null;
        };
        Update: {
          all_day?: boolean;
          block_date?: string;
          created_at?: string;
          created_by?: string | null;
          end_time?: string | null;
          id?: string;
          reason?: string | null;
          start_time?: string | null;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          application_deadline: string | null;
          created_at: string;
          created_by: string | null;
          department: string | null;
          description: string | null;
          education_requirement: string | null;
          employment_type: string;
          id: string;
          job_code: string | null;
          location: string | null;
          max_experience_years: number | null;
          min_experience_years: number | null;
          preferred_skills: string[];
          required_skills: string[];
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          application_deadline?: string | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          description?: string | null;
          education_requirement?: string | null;
          employment_type?: string;
          id?: string;
          job_code?: string | null;
          location?: string | null;
          max_experience_years?: number | null;
          min_experience_years?: number | null;
          preferred_skills?: string[];
          required_skills?: string[];
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          application_deadline?: string | null;
          created_at?: string;
          created_by?: string | null;
          department?: string | null;
          description?: string | null;
          education_requirement?: string | null;
          employment_type?: string;
          id?: string;
          job_code?: string | null;
          location?: string | null;
          max_experience_years?: number | null;
          min_experience_years?: number | null;
          preferred_skills?: string[];
          required_skills?: string[];
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      scheduling_invites: {
        Row: {
          appointment_type: string;
          candidate_id: string;
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          last_used_at: string | null;
          revoked_at: string | null;
          token: string;
        };
        Insert: {
          appointment_type: string;
          candidate_id: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
          token?: string;
        };
        Update: {
          appointment_type?: string;
          candidate_id?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scheduling_invites_appointment_type_fkey";
            columns: ["appointment_type"];
            isOneToOne: false;
            referencedRelation: "appointment_types";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "scheduling_invites_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduling_settings: {
        Row: {
          allow_candidate_reschedule: boolean;
          booking_horizon_days: number;
          break_end: string;
          break_start: string;
          default_meeting_url: string | null;
          id: boolean;
          interviewer_name: string | null;
          min_notice_minutes: number;
          timezone: string;
          updated_at: string;
          work_end: string;
          work_start: string;
          working_days: number[];
        };
        Insert: {
          allow_candidate_reschedule?: boolean;
          booking_horizon_days?: number;
          break_end?: string;
          break_start?: string;
          default_meeting_url?: string | null;
          id?: boolean;
          interviewer_name?: string | null;
          min_notice_minutes?: number;
          timezone?: string;
          updated_at?: string;
          work_end?: string;
          work_start?: string;
          working_days?: number[];
        };
        Update: {
          allow_candidate_reschedule?: boolean;
          booking_horizon_days?: number;
          break_end?: string;
          break_start?: string;
          default_meeting_url?: string | null;
          id?: boolean;
          interviewer_name?: string | null;
          min_notice_minutes?: number;
          timezone?: string;
          updated_at?: string;
          work_end?: string;
          work_start?: string;
          working_days?: number[];
        };
        Relationships: [];
      };
      stage_history: {
        Row: {
          candidate_id: string;
          changed_by: string | null;
          created_at: string;
          from_stage: string | null;
          id: string;
          to_stage: string;
        };
        Insert: {
          candidate_id: string;
          changed_by?: string | null;
          created_at?: string;
          from_stage?: string | null;
          id?: string;
          to_stage: string;
        };
        Update: {
          candidate_id?: string;
          changed_by?: string | null;
          created_at?: string;
          from_stage?: string | null;
          id?: string;
          to_stage?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stage_history_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      app_role: "admin" | "recruiter";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "recruiter"],
    },
  },
} as const;
