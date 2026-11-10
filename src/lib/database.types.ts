export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ad_visit_steps: {
        Row: {
          step: string
          stepped_at: string
          visit_id: string
        }
        Insert: {
          step: string
          stepped_at?: string
          visit_id: string
        }
        Update: {
          step?: string
          stepped_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_visit_steps_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "ad_visits"
            referencedColumns: ["visit_id"]
          },
        ]
      }
      ad_visits: {
        Row: {
          has_fbclid: boolean
          has_gclid: boolean
          id: number
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          visit_id: string
          visited_at: string
        }
        Insert: {
          has_fbclid?: boolean
          has_gclid?: boolean
          id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visit_id: string
          visited_at?: string
        }
        Update: {
          has_fbclid?: boolean
          has_gclid?: boolean
          id?: never
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visit_id?: string
          visited_at?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          email: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      anonymous_test_links: {
        Row: {
          assessment_id: string
          copy_id: string
        }
        Insert: {
          assessment_id: string
          copy_id: string
        }
        Update: {
          assessment_id?: string
          copy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_test_links_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anonymous_test_links_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: true
            referencedRelation: "anonymous_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      anonymous_tests: {
        Row: {
          copy: Json
          copy_version: number
          grade: number
          id: string
          province: string
          test_family: boolean
          test_month: string
        }
        Insert: {
          copy: Json
          copy_version: number
          grade: number
          id?: string
          province: string
          test_family: boolean
          test_month: string
        }
        Update: {
          copy?: Json
          copy_version?: number
          grade?: number
          id?: string
          province?: string
          test_family?: boolean
          test_month?: string
        }
        Relationships: []
      }
      answers: {
        Row: {
          answer_changes: Json | null
          answered_at: string | null
          assessment_id: string
          away_count: number | null
          away_ms: number | null
          correct: boolean
          created_at: string
          id: string
          misconception: string | null
          position: number
          question_id: string
          read_aloud_at_ms: number[] | null
          read_aloud_count: number | null
          response: string
          shown_at: string | null
          strokes_path: string | null
          template_id: string
          time_ms: number
          values: Json
          work_path: string | null
          work_required: boolean
          work_text: string | null
        }
        Insert: {
          answer_changes?: Json | null
          answered_at?: string | null
          assessment_id: string
          away_count?: number | null
          away_ms?: number | null
          correct: boolean
          created_at?: string
          id?: string
          misconception?: string | null
          position: number
          question_id: string
          read_aloud_at_ms?: number[] | null
          read_aloud_count?: number | null
          response: string
          shown_at?: string | null
          strokes_path?: string | null
          template_id: string
          time_ms: number
          values: Json
          work_path?: string | null
          work_required?: boolean
          work_text?: string | null
        }
        Update: {
          answer_changes?: Json | null
          answered_at?: string | null
          assessment_id?: string
          away_count?: number | null
          away_ms?: number | null
          correct?: boolean
          created_at?: string
          id?: string
          misconception?: string | null
          position?: number
          question_id?: string
          read_aloud_at_ms?: number[] | null
          read_aloud_count?: number | null
          response?: string
          shown_at?: string | null
          strokes_path?: string | null
          template_id?: string
          time_ms?: number
          values?: Json
          work_path?: string | null
          work_required?: boolean
          work_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_facts: {
        Row: {
          assessment_id: string
          created_at: string
          started_at: string
          test: Json
        }
        Insert: {
          assessment_id: string
          created_at?: string
          started_at: string
          test: Json
        }
        Update: {
          assessment_id?: string
          created_at?: string
          started_at?: string
          test?: Json
        }
        Relationships: [
          {
            foreignKeyName: "assessment_facts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          break_ended_at: string | null
          break_ms: number | null
          break_skipped: boolean | null
          break_started_at: string | null
          child_id: string
          completed_at: string | null
          created_at: string
          device: Json | null
          grade: number
          help: string | null
          id: string
          last_answer_at: string | null
          parent_id: string
          placement: Json | null
          province: string
          resume_until: string
          route: string | null
          seed: number
          stage3_route: string | null
          started_at: string
          status: string
          test: Json
        }
        Insert: {
          break_ended_at?: string | null
          break_ms?: number | null
          break_skipped?: boolean | null
          break_started_at?: string | null
          child_id: string
          completed_at?: string | null
          created_at?: string
          device?: Json | null
          grade: number
          help?: string | null
          id?: string
          last_answer_at?: string | null
          parent_id: string
          placement?: Json | null
          province: string
          resume_until?: string
          route?: string | null
          seed: number
          stage3_route?: string | null
          started_at?: string
          status?: string
          test: Json
        }
        Update: {
          break_ended_at?: string | null
          break_ms?: number | null
          break_skipped?: boolean | null
          break_started_at?: string | null
          child_id?: string
          completed_at?: string | null
          created_at?: string
          device?: Json | null
          grade?: number
          help?: string | null
          id?: string
          last_answer_at?: string | null
          parent_id?: string
          placement?: Json | null
          province?: string
          resume_until?: string
          route?: string | null
          seed?: number
          stage3_route?: string | null
          started_at?: string
          status?: string
          test?: Json
        }
        Relationships: [
          {
            foreignKeyName: "assessments_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_family_links: {
        Row: {
          hold_id: string
          parent_id: string
          signup_id: number
        }
        Insert: {
          hold_id?: string
          parent_id: string
          signup_id: number
        }
        Update: {
          hold_id?: string
          parent_id?: string
          signup_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_family_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_family_links_signup_id_fkey"
            columns: ["signup_id"]
            isOneToOne: false
            referencedRelation: "signups"
            referencedColumns: ["id"]
          },
        ]
      }
      card_setups: {
        Row: {
          card_saved_at: string | null
          child_id: string
          created_at: string
          id: string
          parent_id: string
          plan: string
          price: number
          report_id: string | null
          stripe_customer_id: string | null
          updated_at: string
          workbook_email_checked_at: string | null
          workbook_welcome_enabled: boolean
        }
        Insert: {
          card_saved_at?: string | null
          child_id: string
          created_at?: string
          id?: string
          parent_id: string
          plan: string
          price: number
          report_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          workbook_email_checked_at?: string | null
          workbook_welcome_enabled?: boolean
        }
        Update: {
          card_saved_at?: string | null
          child_id?: string
          created_at?: string
          id?: string
          parent_id?: string
          plan?: string
          price?: number
          report_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
          workbook_email_checked_at?: string | null
          workbook_welcome_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "card_setups_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_setups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_setups_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      child_card_updates: {
        Row: {
          applied_at: string | null
          child_id: string
          lock_expires_at: string | null
          lock_token: string | null
          needs_repair: boolean
          parent_id: string
          payment_method_id: string | null
          pending_plan_at: string | null
          pending_plan_card: string | null
          pending_plan_key: string | null
          reconciled_at: string | null
          session_created_at: string | null
          session_id: string | null
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          child_id: string
          lock_expires_at?: string | null
          lock_token?: string | null
          needs_repair?: boolean
          parent_id: string
          payment_method_id?: string | null
          pending_plan_at?: string | null
          pending_plan_card?: string | null
          pending_plan_key?: string | null
          reconciled_at?: string | null
          session_created_at?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          child_id?: string
          lock_expires_at?: string | null
          lock_token?: string | null
          needs_repair?: boolean
          parent_id?: string
          payment_method_id?: string | null
          pending_plan_at?: string | null
          pending_plan_card?: string | null
          pending_plan_key?: string | null
          reconciled_at?: string | null
          session_created_at?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_card_updates_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "child_card_updates_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      child_deleted_folders: {
        Row: {
          bucket: string
          parent_id: string
          prefix: string
        }
        Insert: {
          bucket: string
          parent_id: string
          prefix: string
        }
        Update: {
          bucket?: string
          parent_id?: string
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_deleted_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      child_deletions: {
        Row: {
          child_id: string
          folders: Json
          lease_token: string | null
          lease_until: string | null
          parent_id: string
          requested_at: string
        }
        Insert: {
          child_id: string
          folders?: Json
          lease_token?: string | null
          lease_until?: string | null
          parent_id: string
          requested_at?: string
        }
        Update: {
          child_id?: string
          folders?: Json
          lease_token?: string | null
          lease_until?: string | null
          parent_id?: string
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_deletions_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "child_deletions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      child_plan_controls: {
        Row: {
          cancelled: boolean
          child_id: string
          parent_id: string
          revision: string | null
        }
        Insert: {
          cancelled?: boolean
          child_id: string
          parent_id: string
          revision?: string | null
        }
        Update: {
          cancelled?: boolean
          child_id?: string
          parent_id?: string
          revision?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "child_plan_controls_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_plan_controls_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "child_plan_controls_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      child_plan_prices: {
        Row: {
          child_id: string
          confirmed: boolean
          monthly_cents: number
          parent_id: string
          released: boolean
          start_key: string
        }
        Insert: {
          child_id: string
          confirmed?: boolean
          monthly_cents: number
          parent_id: string
          released?: boolean
          start_key: string
        }
        Update: {
          child_id?: string
          confirmed?: boolean
          monthly_cents?: number
          parent_id?: string
          released?: boolean
          start_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_plan_prices_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      child_plan_states: {
        Row: {
          child_id: string
          ending_free: boolean
          ends_at: string | null
          event_at: string | null
          event_id: string | null
          kind: string
          monthly_cents: number | null
          next_charge_at: string | null
          parent_id: string
          read_at: string
          read_order: number | null
          read_tried_at: string | null
          updated_at: string
        }
        Insert: {
          child_id: string
          ending_free?: boolean
          ends_at?: string | null
          event_at?: string | null
          event_id?: string | null
          kind: string
          monthly_cents?: number | null
          next_charge_at?: string | null
          parent_id: string
          read_at: string
          read_order?: number | null
          read_tried_at?: string | null
          updated_at?: string
        }
        Update: {
          child_id?: string
          ending_free?: boolean
          ends_at?: string | null
          event_at?: string | null
          event_id?: string | null
          kind?: string
          monthly_cents?: number | null
          next_charge_at?: string | null
          parent_id?: string
          read_at?: string
          read_order?: number | null
          read_tried_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_plan_states_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "child_plan_states_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      child_profiles: {
        Row: {
          assessment_id: string | null
          build_token: string
          built_at: string
          child_id: string
          created_at: string
          parent_id: string
          profile: Json
          revision: number
          schema_version: number
        }
        Insert: {
          assessment_id?: string | null
          build_token?: string
          built_at?: string
          child_id: string
          created_at?: string
          parent_id: string
          profile: Json
          revision: number
          schema_version: number
        }
        Update: {
          assessment_id?: string | null
          build_token?: string
          built_at?: string
          child_id?: string
          created_at?: string
          parent_id?: string
          profile?: Json
          revision?: number
          schema_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "child_profiles_assessment_id_child_id_fkey"
            columns: ["assessment_id", "child_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "child_id"]
          },
          {
            foreignKeyName: "child_profiles_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "child_profiles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          created_at: string
          first_name: string
          former_names: string[]
          grade: number
          id: string
          interests: string[] | null
          learning_goal: string | null
          learning_note: string | null
          learning_styles: string[] | null
          learning_updated_at: string | null
          math_feeling: string | null
          parent_id: string
          province: string
          weekly_time: string | null
        }
        Insert: {
          created_at?: string
          first_name: string
          former_names?: string[]
          grade: number
          id?: string
          interests?: string[] | null
          learning_goal?: string | null
          learning_note?: string | null
          learning_styles?: string[] | null
          learning_updated_at?: string | null
          math_feeling?: string | null
          parent_id: string
          province: string
          weekly_time?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string
          former_names?: string[]
          grade?: number
          id?: string
          interests?: string[] | null
          learning_goal?: string | null
          learning_note?: string | null
          learning_styles?: string[] | null
          learning_updated_at?: string | null
          math_feeling?: string | null
          parent_id?: string
          province?: string
          weekly_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "children_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      email_copies: {
        Row: {
          created_at: string
          email_id: string | null
          email_log_id: string | null
          from_address: string | null
          html_body: string | null
          id: string
          outcome: string
          parent_id: string
          reply_to: string | null
          report_email: string | null
          report_id: string | null
          subject: string
          text_body: string
          to_address: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_id?: string | null
          email_log_id?: string | null
          from_address?: string | null
          html_body?: string | null
          id?: string
          outcome: string
          parent_id: string
          reply_to?: string | null
          report_email?: string | null
          report_id?: string | null
          subject: string
          text_body: string
          to_address: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_id?: string | null
          email_log_id?: string | null
          from_address?: string | null
          html_body?: string | null
          id?: string
          outcome?: string
          parent_id?: string
          reply_to?: string | null
          report_email?: string | null
          report_id?: string | null
          subject?: string
          text_body?: string
          to_address?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_copies_email_log_id_fkey"
            columns: ["email_log_id"]
            isOneToOne: true
            referencedRelation: "email_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_copies_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_copies_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          detail: string | null
          email_id: string
          id: string
          occurred_at: string
          received_at: string
          type: string
          webhook_id: string
        }
        Insert: {
          detail?: string | null
          email_id: string
          id?: string
          occurred_at: string
          received_at?: string
          type: string
          webhook_id: string
        }
        Update: {
          detail?: string | null
          email_id?: string
          id?: string
          occurred_at?: string
          received_at?: string
          type?: string
          webhook_id?: string
        }
        Relationships: []
      }
      email_log: {
        Row: {
          assessment_id: string | null
          attempts: number
          call_ids: string[] | null
          child_id: string | null
          clicks: number
          copy_child_ids: string[] | null
          copy_redacted: boolean
          created_at: string
          day: string | null
          email_id: string | null
          error: string | null
          first_clicked_at: string | null
          id: string
          kind: string
          last_clicked_at: string | null
          parent_id: string
          sent_at: string | null
          status: string | null
          summary_month: string | null
          unsubscribe_hash: string | null
          week_start: string | null
        }
        Insert: {
          assessment_id?: string | null
          attempts?: number
          call_ids?: string[] | null
          child_id?: string | null
          clicks?: number
          copy_child_ids?: string[] | null
          copy_redacted?: boolean
          created_at?: string
          day?: string | null
          email_id?: string | null
          error?: string | null
          first_clicked_at?: string | null
          id?: string
          kind: string
          last_clicked_at?: string | null
          parent_id: string
          sent_at?: string | null
          status?: string | null
          summary_month?: string | null
          unsubscribe_hash?: string | null
          week_start?: string | null
        }
        Update: {
          assessment_id?: string | null
          attempts?: number
          call_ids?: string[] | null
          child_id?: string | null
          clicks?: number
          copy_child_ids?: string[] | null
          copy_redacted?: boolean
          created_at?: string
          day?: string | null
          email_id?: string | null
          error?: string | null
          first_clicked_at?: string | null
          id?: string
          kind?: string
          last_clicked_at?: string | null
          parent_id?: string
          sent_at?: string | null
          status?: string | null
          summary_month?: string | null
          unsubscribe_hash?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      fact_answers: {
        Row: {
          assessment_id: string
          at_ms: number
          browser_ms: number | null
          correct: boolean
          created_at: string
          fact_id: string
          id: string
          position: number
          response: string
          server_ms: number | null
        }
        Insert: {
          assessment_id: string
          at_ms: number
          browser_ms?: number | null
          correct: boolean
          created_at?: string
          fact_id: string
          id?: string
          position: number
          response: string
          server_ms?: number | null
        }
        Update: {
          assessment_id?: string
          at_ms?: number
          browser_ms?: number | null
          correct?: boolean
          created_at?: string
          fact_id?: string
          id?: string
          position?: number
          response?: string
          server_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fact_answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_facts"
            referencedColumns: ["assessment_id"]
          },
        ]
      }
      family_card_operations: {
        Row: {
          id: string
          parent_id: string
          started_at: string
        }
        Insert: {
          id: string
          parent_id: string
          started_at?: string
        }
        Update: {
          id?: string
          parent_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_card_operations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      family_delete_attempts: {
        Row: {
          failed_attempts: number
          locked_until: string | null
          parent_id: string
        }
        Insert: {
          failed_attempts?: number
          locked_until?: string | null
          parent_id: string
        }
        Update: {
          failed_attempts?: number
          locked_until?: string | null
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_delete_attempts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: true
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      family_delete_codes: {
        Row: {
          code_hash: string | null
          expires_at: string | null
          parent_id: string
          send_times: string[]
        }
        Insert: {
          code_hash?: string | null
          expires_at?: string | null
          parent_id: string
          send_times?: string[]
        }
        Update: {
          code_hash?: string | null
          expires_at?: string | null
          parent_id?: string
          send_times?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "family_delete_codes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: true
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      family_delete_holds: {
        Row: {
          lease_token: string
          lease_until: string
          parent_id: string
        }
        Insert: {
          lease_token: string
          lease_until: string
          parent_id: string
        }
        Update: {
          lease_token?: string
          lease_until?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_delete_holds_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: true
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      family_deletion_schedule: {
        Row: {
          last_parent: string | null
          singleton: boolean
        }
        Insert: {
          last_parent?: string | null
          singleton?: boolean
        }
        Update: {
          last_parent?: string | null
          singleton?: boolean
        }
        Relationships: []
      }
      family_deletions: {
        Row: {
          lease_token: string | null
          lease_until: string | null
          parent_id: string
          phase: string
          plans_stopped_at: string | null
          reason: string
          requested_at: string
        }
        Insert: {
          lease_token?: string | null
          lease_until?: string | null
          parent_id: string
          phase?: string
          plans_stopped_at?: string | null
          reason: string
          requested_at?: string
        }
        Update: {
          lease_token?: string | null
          lease_until?: string | null
          parent_id?: string
          phase?: string
          plans_stopped_at?: string | null
          reason?: string
          requested_at?: string
        }
        Relationships: []
      }
      family_finish_claims: {
        Row: {
          claim: string
          claimed_at: string
          user_id: string
        }
        Insert: {
          claim: string
          claimed_at?: string
          user_id: string
        }
        Update: {
          claim?: string
          claimed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      family_payment_operations: {
        Row: {
          customer_id: string
          kind: string
          object_id: string
          origin_token: string
          outcome: string | null
          parent_id: string
          started_at: string
        }
        Insert: {
          customer_id: string
          kind: string
          object_id: string
          origin_token: string
          outcome?: string | null
          parent_id: string
          started_at?: string
        }
        Update: {
          customer_id?: string
          kind?: string
          object_id?: string
          origin_token?: string
          outcome?: string | null
          parent_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_payment_operations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "family_deletions"
            referencedColumns: ["parent_id"]
          },
        ]
      }
      family_payment_progress: {
        Row: {
          after_id: string | null
          customer_id: string
          done: boolean
          head_id: string | null
          parent_id: string
        }
        Insert: {
          after_id?: string | null
          customer_id: string
          done?: boolean
          head_id?: string | null
          parent_id: string
        }
        Update: {
          after_id?: string | null
          customer_id?: string
          done?: boolean
          head_id?: string | null
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_payment_progress_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "family_deletions"
            referencedColumns: ["parent_id"]
          },
        ]
      }
      family_plan_windows: {
        Row: {
          confirmed: boolean
          ends_at: string | null
          first_child_id: string
          parent_id: string
          released: boolean
          start_key: string
          started_at: string | null
        }
        Insert: {
          confirmed?: boolean
          ends_at?: string | null
          first_child_id: string
          parent_id: string
          released?: boolean
          start_key: string
          started_at?: string | null
        }
        Update: {
          confirmed?: boolean
          ends_at?: string | null
          first_child_id?: string
          parent_id?: string
          released?: boolean
          start_key?: string
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_plan_windows_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: true
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          child_id: string | null
          created_at: string
          id: string
          parent_id: string
          product: string
          request_id: string
          source: string
          status: string
          text: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string
          id?: string
          parent_id: string
          product: string
          request_id: string
          source: string
          status?: string
          text: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          id?: string
          parent_id?: string
          product?: string
          request_id?: string
          source?: string
          status?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "feedback_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      flyer_batches: {
        Row: {
          code: string
          delivered: number
          updated_at: string
        }
        Insert: {
          code: string
          delivered?: number
          updated_at?: string
        }
        Update: {
          code?: string
          delivered?: number
          updated_at?: string
        }
        Relationships: []
      }
      flyer_scans: {
        Row: {
          code: string
          id: number
          scanned_at: string
        }
        Insert: {
          code: string
          id?: never
          scanned_at?: string
        }
        Update: {
          code?: string
          id?: never
          scanned_at?: string
        }
        Relationships: []
      }
      learner_profiles: {
        Row: {
          assessment_id: string
          built_at: string
          child_id: string
          created_at: string
          id: string
          parent_id: string
          profile: Json
          schema_version: number
        }
        Insert: {
          assessment_id: string
          built_at?: string
          child_id: string
          created_at?: string
          id?: string
          parent_id: string
          profile: Json
          schema_version: number
        }
        Update: {
          assessment_id?: string
          built_at?: string
          child_id?: string
          created_at?: string
          id?: string
          parent_id?: string
          profile?: Json
          schema_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "learner_profiles_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_profiles_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_profiles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_events: {
        Row: {
          assessment_id: string | null
          assessment_question_id: string | null
          child_id: string
          created_at: string
          evidence_id: string | null
          evidence_kind: string | null
          hints: number
          id: string
          idempotency_key: string
          mistake: string | null
          occurred_at: string
          parent_id: string
          question_source: string
          result: string
          skill_standard: string
          skills: string[]
          source: string
          stuck_step: string | null
          time_ms: number | null
          workbook_id: string | null
          workbook_page: number | null
          workbook_question: number | null
        }
        Insert: {
          assessment_id?: string | null
          assessment_question_id?: string | null
          child_id: string
          created_at?: string
          evidence_id?: string | null
          evidence_kind?: string | null
          hints?: number
          id?: string
          idempotency_key: string
          mistake?: string | null
          occurred_at: string
          parent_id: string
          question_source: string
          result: string
          skill_standard: string
          skills?: string[]
          source: string
          stuck_step?: string | null
          time_ms?: number | null
          workbook_id?: string | null
          workbook_page?: number | null
          workbook_question?: number | null
        }
        Update: {
          assessment_id?: string | null
          assessment_question_id?: string | null
          child_id?: string
          created_at?: string
          evidence_id?: string | null
          evidence_kind?: string | null
          hints?: number
          id?: string
          idempotency_key?: string
          mistake?: string | null
          occurred_at?: string
          parent_id?: string
          question_source?: string
          result?: string
          skill_standard?: string
          skills?: string[]
          source?: string
          stuck_step?: string | null
          time_ms?: number | null
          workbook_id?: string | null
          workbook_page?: number | null
          workbook_question?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_events_assessment_id_child_id_fkey"
            columns: ["assessment_id", "child_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "child_id"]
          },
          {
            foreignKeyName: "learning_events_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_events_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "learning_events_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_events_workbook_fkey"
            columns: ["workbook_id", "child_id"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "child_id"]
          },
        ]
      }
      maya_call_alerts: {
        Row: {
          call_id: string
          claimed_at: string
          created_at: string
          email_id: string | null
          error: string | null
          id: string
          level: string
          parent_id: string
          status: string
          subject: string | null
          text_body: string | null
          updated_at: string
        }
        Insert: {
          call_id: string
          claimed_at: string
          created_at?: string
          email_id?: string | null
          error?: string | null
          id?: string
          level: string
          parent_id: string
          status: string
          subject?: string | null
          text_body?: string | null
          updated_at?: string
        }
        Update: {
          call_id?: string
          claimed_at?: string
          created_at?: string
          email_id?: string | null
          error?: string | null
          id?: string
          level?: string
          parent_id?: string
          status?: string
          subject?: string | null
          text_body?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_call_alerts_call_fkey"
            columns: ["call_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "maya_calls"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_call_alerts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_call_connections: {
        Row: {
          at: string
          call_id: string
          child_id: string
          id: number
          kind: string
          parent_id: string
          recorded_at: string
        }
        Insert: {
          at: string
          call_id: string
          child_id: string
          id?: never
          kind: string
          parent_id: string
          recorded_at?: string
        }
        Update: {
          at?: string
          call_id?: string
          child_id?: string
          id?: never
          kind?: string
          parent_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_call_connections_call_fkey"
            columns: ["call_id", "parent_id", "child_id"]
            isOneToOne: false
            referencedRelation: "maya_calls"
            referencedColumns: ["id", "parent_id", "child_id"]
          },
          {
            foreignKeyName: "maya_call_connections_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_call_connections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_call_ink_events: {
        Row: {
          call_id: string
          child_id: string
          event: Json
          parent_id: string
          received_at: string
          seq: number
        }
        Insert: {
          call_id: string
          child_id: string
          event: Json
          parent_id: string
          received_at?: string
          seq: number
        }
        Update: {
          call_id?: string
          child_id?: string
          event?: Json
          parent_id?: string
          received_at?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "maya_call_ink_events_call_fkey"
            columns: ["call_id", "parent_id", "child_id"]
            isOneToOne: false
            referencedRelation: "maya_calls"
            referencedColumns: ["id", "parent_id", "child_id"]
          },
          {
            foreignKeyName: "maya_call_ink_events_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_call_ink_events_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_call_notes: {
        Row: {
          call_ended_at: string
          call_id: string
          child_id: string
          created_at: string
          facts: Json
          model: string | null
          note_version: number
          parent_id: string
          prompt_version: string | null
          sentences: Json
          transcript: Json
          warm: string | null
          writer: string
        }
        Insert: {
          call_ended_at: string
          call_id: string
          child_id: string
          created_at?: string
          facts: Json
          model?: string | null
          note_version?: number
          parent_id: string
          prompt_version?: string | null
          sentences: Json
          transcript: Json
          warm?: string | null
          writer: string
        }
        Update: {
          call_ended_at?: string
          call_id?: string
          child_id?: string
          created_at?: string
          facts?: Json
          model?: string | null
          note_version?: number
          parent_id?: string
          prompt_version?: string | null
          sentences?: Json
          transcript?: Json
          warm?: string | null
          writer?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_call_notes_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: true
            referencedRelation: "maya_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maya_call_notes_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_call_notes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_call_sweep_cursors: {
        Row: {
          at: string | null
          call_id: string | null
          kind: string
          until_at: string | null
          updated_at: string
        }
        Insert: {
          at?: string | null
          call_id?: string | null
          kind: string
          until_at?: string | null
          updated_at?: string
        }
        Update: {
          at?: string | null
          call_id?: string | null
          kind?: string
          until_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      maya_calls: {
        Row: {
          assessment_id: string | null
          assessment_question_id: string | null
          assistance: string | null
          board_history: Json | null
          call_seconds: number | null
          channel: string | null
          child_id: string
          child_ink: Json | null
          child_ink_at: string | null
          child_turns: number | null
          connected_seconds: number | null
          counts_minutes: boolean
          created_at: string
          ended_at: string | null
          fallbacks: number | null
          flag: string | null
          flagged_at: string | null
          highest_hint: number | null
          id: string
          kind: string
          learning_event_id: string | null
          live: Json | null
          maya_turns: number | null
          mishearing_confirmations: number | null
          mishearing_corrections: number | null
          mode: string
          model: string
          note_pending: Json | null
          outcome_reason: string | null
          package_hash: string
          package_id: string
          paper_status: string | null
          parent_id: string
          profile_rebuilt_at: string | null
          prompt_version: string
          question_source: string
          question_text: string | null
          record_version: number
          revision: number
          safety_flag: boolean
          safety_severity: string | null
          speech_to_text: string | null
          started_at: string | null
          started_by: string | null
          status: string
          trace: Json | null
          understanding: string | null
          updated_at: string
          versions: Json
          voice: string | null
          workbook_id: string | null
          workbook_page: number | null
          workbook_question: number | null
        }
        Insert: {
          assessment_id?: string | null
          assessment_question_id?: string | null
          assistance?: string | null
          board_history?: Json | null
          call_seconds?: number | null
          channel?: string | null
          child_id: string
          child_ink?: Json | null
          child_ink_at?: string | null
          child_turns?: number | null
          connected_seconds?: number | null
          counts_minutes?: boolean
          created_at?: string
          ended_at?: string | null
          fallbacks?: number | null
          flag?: string | null
          flagged_at?: string | null
          highest_hint?: number | null
          id: string
          kind: string
          learning_event_id?: string | null
          live?: Json | null
          maya_turns?: number | null
          mishearing_confirmations?: number | null
          mishearing_corrections?: number | null
          mode?: string
          model: string
          note_pending?: Json | null
          outcome_reason?: string | null
          package_hash: string
          package_id: string
          paper_status?: string | null
          parent_id: string
          profile_rebuilt_at?: string | null
          prompt_version: string
          question_source: string
          question_text?: string | null
          record_version?: number
          revision?: number
          safety_flag?: boolean
          safety_severity?: string | null
          speech_to_text?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          trace?: Json | null
          understanding?: string | null
          updated_at?: string
          versions: Json
          voice?: string | null
          workbook_id?: string | null
          workbook_page?: number | null
          workbook_question?: number | null
        }
        Update: {
          assessment_id?: string | null
          assessment_question_id?: string | null
          assistance?: string | null
          board_history?: Json | null
          call_seconds?: number | null
          channel?: string | null
          child_id?: string
          child_ink?: Json | null
          child_ink_at?: string | null
          child_turns?: number | null
          connected_seconds?: number | null
          counts_minutes?: boolean
          created_at?: string
          ended_at?: string | null
          fallbacks?: number | null
          flag?: string | null
          flagged_at?: string | null
          highest_hint?: number | null
          id?: string
          kind?: string
          learning_event_id?: string | null
          live?: Json | null
          maya_turns?: number | null
          mishearing_confirmations?: number | null
          mishearing_corrections?: number | null
          mode?: string
          model?: string
          note_pending?: Json | null
          outcome_reason?: string | null
          package_hash?: string
          package_id?: string
          paper_status?: string | null
          parent_id?: string
          profile_rebuilt_at?: string | null
          prompt_version?: string
          question_source?: string
          question_text?: string | null
          record_version?: number
          revision?: number
          safety_flag?: boolean
          safety_severity?: string | null
          speech_to_text?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: string
          trace?: Json | null
          understanding?: string | null
          updated_at?: string
          versions?: Json
          voice?: string | null
          workbook_id?: string | null
          workbook_page?: number | null
          workbook_question?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maya_calls_assessment_fkey"
            columns: ["assessment_id", "child_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id", "child_id"]
          },
          {
            foreignKeyName: "maya_calls_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_calls_learning_event_id_fkey"
            columns: ["learning_event_id"]
            isOneToOne: false
            referencedRelation: "learning_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maya_calls_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_chat_families: {
        Row: {
          added_at: string
          added_by: string
          parent_id: string
          rehearsal: boolean
        }
        Insert: {
          added_at?: string
          added_by?: string
          parent_id: string
          rehearsal?: boolean
        }
        Update: {
          added_at?: string
          added_by?: string
          parent_id?: string
          rehearsal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "maya_chat_families_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: true
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_chat_messages: {
        Row: {
          body: string | null
          call_id: string
          child_id: string
          claim_revision: number
          fingerprint: string
          id: string
          input_revision: number
          lease_until: string
          parent_id: string
          received_at: string
        }
        Insert: {
          body?: string | null
          call_id: string
          child_id: string
          claim_revision: number
          fingerprint: string
          id: string
          input_revision: number
          lease_until: string
          parent_id: string
          received_at?: string
        }
        Update: {
          body?: string | null
          call_id?: string
          child_id?: string
          claim_revision?: number
          fingerprint?: string
          id?: string
          input_revision?: number
          lease_until?: string
          parent_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_chat_messages_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "maya_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maya_chat_messages_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_chat_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_demo_children: {
        Row: {
          child_id: string
          created_at: string
          made_by: string
          parent_id: string
        }
        Insert: {
          child_id: string
          created_at?: string
          made_by?: string
          parent_id: string
        }
        Update: {
          child_id?: string
          created_at?: string
          made_by?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_demo_children_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_demo_children_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_minute_grants: {
        Row: {
          call_id: string
          child_id: string | null
          created_at: string
          granted_seconds: number
          kind: string
          parent_id: string
          period: string
          period_start: string | null
          settled_at: string | null
          used_seconds: number | null
        }
        Insert: {
          call_id: string
          child_id?: string | null
          created_at?: string
          granted_seconds: number
          kind: string
          parent_id: string
          period: string
          period_start?: string | null
          settled_at?: string | null
          used_seconds?: number | null
        }
        Update: {
          call_id?: string
          child_id?: string | null
          created_at?: string
          granted_seconds?: number
          kind?: string
          parent_id?: string
          period?: string
          period_start?: string | null
          settled_at?: string | null
          used_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "maya_minute_grants_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_minute_grants_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_notice_acceptances: {
        Row: {
          accepted_at: string
          accepted_by: string
          notice_version: string
          parent_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          notice_version: string
          parent_id: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          notice_version?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_notice_acceptances_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_spend: {
        Row: {
          call_id: string | null
          charge: string
          child_id: string | null
          cost_micros: number | null
          created_at: string
          id: string
          month: string
          parent_id: string | null
          reserved_micros: number
          settled_at: string | null
          uncertain: boolean
          week: string | null
          what: string
        }
        Insert: {
          call_id?: string | null
          charge: string
          child_id?: string | null
          cost_micros?: number | null
          created_at?: string
          id: string
          month: string
          parent_id?: string | null
          reserved_micros: number
          settled_at?: string | null
          uncertain?: boolean
          week?: string | null
          what: string
        }
        Update: {
          call_id?: string | null
          charge?: string
          child_id?: string | null
          cost_micros?: number | null
          created_at?: string
          id?: string
          month?: string
          parent_id?: string | null
          reserved_micros?: number
          settled_at?: string | null
          uncertain?: boolean
          week?: string | null
          what?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_spend_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_spend_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      maya_spend_alerts: {
        Row: {
          claimed_at: string
          month: string
        }
        Insert: {
          claimed_at?: string
          month: string
        }
        Update: {
          claimed_at?: string
          month?: string
        }
        Relationships: []
      }
      maya_wording_history: {
        Row: {
          child_id: string
          heard: Json
          parent_id: string
          updated_at: string
        }
        Insert: {
          child_id: string
          heard?: Json
          parent_id: string
          updated_at?: string
        }
        Update: {
          child_id?: string
          heard?: Json
          parent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maya_wording_history_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "maya_wording_history_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_summary_renders: {
        Row: {
          created_at: string
          id: string
          parent_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_summary_renders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      next_book_snapshots: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          child_id: string
          consumed_ledger: Json | null
          created_at: string
          delivery_audit_id: number | null
          draft_id: string | null
          frozen_at: string | null
          held_at: string | null
          held_for_later: Json | null
          held_reason: string | null
          history_fence: Json | null
          id: string
          number: number
          parent_id: string
          pending_items: Json | null
          plan_hash: string | null
          plan_input: Json | null
          planner_consumed: Json | null
          planner_held: Json | null
          prepare_from: string
          printed_revision: string
          progress_history: Json | null
          progress_snapshot: Json | null
          receipt_ids: string[]
          revision: number
          run_id: string | null
          scope: Json | null
          snapshot_hash: string | null
          sources: Json | null
          trigger_at: string
          trigger_id: string | null
          trigger_reason: string
          workbook_id: string
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          child_id: string
          consumed_ledger?: Json | null
          created_at?: string
          delivery_audit_id?: number | null
          draft_id?: string | null
          frozen_at?: string | null
          held_at?: string | null
          held_for_later?: Json | null
          held_reason?: string | null
          history_fence?: Json | null
          id?: string
          number: number
          parent_id: string
          pending_items?: Json | null
          plan_hash?: string | null
          plan_input?: Json | null
          planner_consumed?: Json | null
          planner_held?: Json | null
          prepare_from: string
          printed_revision: string
          progress_history?: Json | null
          progress_snapshot?: Json | null
          receipt_ids: string[]
          revision: number
          run_id?: string | null
          scope?: Json | null
          snapshot_hash?: string | null
          sources?: Json | null
          trigger_at: string
          trigger_id?: string | null
          trigger_reason: string
          workbook_id: string
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          child_id?: string
          consumed_ledger?: Json | null
          created_at?: string
          delivery_audit_id?: number | null
          draft_id?: string | null
          frozen_at?: string | null
          held_at?: string | null
          held_for_later?: Json | null
          held_reason?: string | null
          history_fence?: Json | null
          id?: string
          number?: number
          parent_id?: string
          pending_items?: Json | null
          plan_hash?: string | null
          plan_input?: Json | null
          planner_consumed?: Json | null
          planner_held?: Json | null
          prepare_from?: string
          printed_revision?: string
          progress_history?: Json | null
          progress_snapshot?: Json | null
          receipt_ids?: string[]
          revision?: number
          run_id?: string | null
          scope?: Json | null
          snapshot_hash?: string | null
          sources?: Json | null
          trigger_at?: string
          trigger_id?: string | null
          trigger_reason?: string
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "next_book_snapshots_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "next_book_snapshots_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "workbook_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_book_snapshots_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_book_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_book_snapshots_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "workbook_scan_trigger_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "next_book_snapshots_workbook_id_parent_id_child_id_number_fkey"
            columns: ["workbook_id", "parent_id", "child_id", "number"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "parent_id", "child_id", "number"]
          },
        ]
      }
      parent_explanation_dispatches: {
        Row: {
          child_id: string
          context: string
          id: string
          item_id: string
          parent_id: string
        }
        Insert: {
          child_id: string
          context: string
          id: string
          item_id: string
          parent_id: string
        }
        Update: {
          child_id?: string
          context?: string
          id?: string
          item_id?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_explanation_dispatches_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "parent_explanation_dispatches_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "parent_explanation_spend"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_explanation_dispatches_item_id_context_fkey"
            columns: ["item_id", "context"]
            isOneToOne: false
            referencedRelation: "parent_explanations"
            referencedColumns: ["item_id", "context"]
          },
          {
            foreignKeyName: "parent_explanation_dispatches_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_explanation_prices: {
        Row: {
          enabled: boolean
          evidence: string | null
          max_input_bytes: number
          max_tokens: number
          maximum_micros: number | null
          model: string
          protocol: string
          verified_at: string | null
        }
        Insert: {
          enabled?: boolean
          evidence?: string | null
          max_input_bytes?: number
          max_tokens?: number
          maximum_micros?: number | null
          model: string
          protocol?: string
          verified_at?: string | null
        }
        Update: {
          enabled?: boolean
          evidence?: string | null
          max_input_bytes?: number
          max_tokens?: number
          maximum_micros?: number | null
          model?: string
          protocol?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      parent_explanation_spend: {
        Row: {
          charged_micros: number | null
          created_at: string
          id: string
          model: string
          period: string
          reserved_micros: number
          settled_at: string | null
        }
        Insert: {
          charged_micros?: number | null
          created_at?: string
          id?: string
          model: string
          period: string
          reserved_micros: number
          settled_at?: string | null
        }
        Update: {
          charged_micros?: number | null
          created_at?: string
          id?: string
          model?: string
          period?: string
          reserved_micros?: number
          settled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_explanation_spend_model_fkey"
            columns: ["model"]
            isOneToOne: false
            referencedRelation: "parent_explanation_prices"
            referencedColumns: ["model"]
          },
        ]
      }
      parent_explanations: {
        Row: {
          child_id: string
          context: string
          explanation: Json | null
          item_id: string
          lease_token: string
          lease_until: string
          parent_id: string
        }
        Insert: {
          child_id: string
          context: string
          explanation?: Json | null
          item_id: string
          lease_token: string
          lease_until: string
          parent_id: string
        }
        Update: {
          child_id?: string
          context?: string
          explanation?: Json | null
          item_id?: string
          lease_token?: string
          lease_until?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_explanations_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "parent_explanations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "scan_marking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_explanations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_pins: {
        Row: {
          created_at: string
          failed_attempts: number
          locked_until: string | null
          parent_id: string
          pin_hash: string
          reset_failed_attempts: number
          reset_locked_until: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          parent_id: string
          pin_hash: string
          reset_failed_attempts?: number
          reset_locked_until?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          parent_id?: string
          pin_hash?: string
          reset_failed_attempts?: number
          reset_locked_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_pins_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: true
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          created_at: string
          deletion_requested_at: string | null
          email: string
          id: string
          name: string
          postal: string | null
          source: Json
          time_zone: string | null
        }
        Insert: {
          created_at?: string
          deletion_requested_at?: string | null
          email: string
          id: string
          name: string
          postal?: string | null
          source?: Json
          time_zone?: string | null
        }
        Update: {
          created_at?: string
          deletion_requested_at?: string | null
          email?: string
          id?: string
          name?: string
          postal?: string | null
          source?: Json
          time_zone?: string | null
        }
        Relationships: []
      }
      plan_cancel_alerts: {
        Row: {
          claimed_at: string
          operation_id: string
          state: string
        }
        Insert: {
          claimed_at?: string
          operation_id: string
          state: string
        }
        Update: {
          claimed_at?: string
          operation_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_cancel_alerts_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: true
            referencedRelation: "plan_control_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_control_operations: {
        Row: {
          allowance_year: number | null
          card_setup_id: string
          child_id: string
          created_at: string
          deletion_closed_at: string | null
          finished_at: string | null
          id: string
          kind: string
          mailing_retired_at: string | null
          parent_id: string
          quote: Json
          state: string
          target_number: number | null
          token: string
          weeks: number
        }
        Insert: {
          allowance_year?: number | null
          card_setup_id: string
          child_id: string
          created_at?: string
          deletion_closed_at?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          mailing_retired_at?: string | null
          parent_id: string
          quote?: Json
          state?: string
          target_number?: number | null
          token: string
          weeks?: number
        }
        Update: {
          allowance_year?: number | null
          card_setup_id?: string
          child_id?: string
          created_at?: string
          deletion_closed_at?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          mailing_retired_at?: string | null
          parent_id?: string
          quote?: Json
          state?: string
          target_number?: number | null
          token?: string
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_control_operations_card_setup_id_fkey"
            columns: ["card_setup_id"]
            isOneToOne: false
            referencedRelation: "card_setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_control_operations_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_control_operations_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "plan_control_operations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_starts: {
        Row: {
          card_setup_id: string
          email_attempts: number
          email_claim_token: string | null
          email_claimed_at: string | null
          email_error: string | null
          email_html: string | null
          email_noted_at: string | null
          email_provider_id: string | null
          email_send_status: string | null
          email_sent_at: string | null
          email_state: string
          email_subject: string | null
          email_text: string | null
          email_to: string | null
          ended_by: string | null
          family_terms: boolean
          finished_at: string | null
          first_charge_at: string | null
          generation: number
          monthly_cents: number | null
          parent_id: string
          payment_method_id: string
          purpose: string
          read_tried_at: string | null
          start_key: string
          started_at: string
          state: string
          subscription_id: string | null
          team_alert_at: string | null
          team_alert_email_id: string | null
          team_alert_error: string | null
          team_alert_state: string | null
          trial_end: string | null
        }
        Insert: {
          card_setup_id: string
          email_attempts?: number
          email_claim_token?: string | null
          email_claimed_at?: string | null
          email_error?: string | null
          email_html?: string | null
          email_noted_at?: string | null
          email_provider_id?: string | null
          email_send_status?: string | null
          email_sent_at?: string | null
          email_state?: string
          email_subject?: string | null
          email_text?: string | null
          email_to?: string | null
          ended_by?: string | null
          family_terms?: boolean
          finished_at?: string | null
          first_charge_at?: string | null
          generation: number
          monthly_cents?: number | null
          parent_id: string
          payment_method_id: string
          purpose?: string
          read_tried_at?: string | null
          start_key: string
          started_at?: string
          state?: string
          subscription_id?: string | null
          team_alert_at?: string | null
          team_alert_email_id?: string | null
          team_alert_error?: string | null
          team_alert_state?: string | null
          trial_end?: string | null
        }
        Update: {
          card_setup_id?: string
          email_attempts?: number
          email_claim_token?: string | null
          email_claimed_at?: string | null
          email_error?: string | null
          email_html?: string | null
          email_noted_at?: string | null
          email_provider_id?: string | null
          email_send_status?: string | null
          email_sent_at?: string | null
          email_state?: string
          email_subject?: string | null
          email_text?: string | null
          email_to?: string | null
          ended_by?: string | null
          family_terms?: boolean
          finished_at?: string | null
          first_charge_at?: string | null
          generation?: number
          monthly_cents?: number | null
          parent_id?: string
          payment_method_id?: string
          purpose?: string
          read_tried_at?: string | null
          start_key?: string
          started_at?: string
          state?: string
          subscription_id?: string | null
          team_alert_at?: string | null
          team_alert_email_id?: string | null
          team_alert_error?: string | null
          team_alert_state?: string | null
          trial_end?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_starts_card_setup_id_fkey"
            columns: ["card_setup_id"]
            isOneToOne: false
            referencedRelation: "card_setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_starts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      question_shows: {
        Row: {
          assessment_id: string
          created_at: string
          position: number
          question_id: string
          shown_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          position: number
          question_id: string
          shown_at: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          position?: number
          question_id?: string
          shown_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_shows_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      report_retries: {
        Row: {
          alert_email_id: string | null
          alert_error: string | null
          assessment_id: string
          attempts: number
          created_at: string
          gave_up_at: string | null
          last_attempt_at: string | null
          last_email: boolean | null
          next_at: string
        }
        Insert: {
          alert_email_id?: string | null
          alert_error?: string | null
          assessment_id: string
          attempts?: number
          created_at?: string
          gave_up_at?: string | null
          last_attempt_at?: string | null
          last_email?: boolean | null
          next_at?: string
        }
        Update: {
          alert_email_id?: string | null
          alert_error?: string | null
          assessment_id?: string
          attempts?: number
          created_at?: string
          gave_up_at?: string | null
          last_attempt_at?: string | null
          last_email?: boolean | null
          next_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_retries_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          alert_error: string | null
          alerted_at: string | null
          assessment_id: string
          child_id: string
          created_at: string
          email_clicks: number
          email_error: string | null
          email_first_clicked_at: string | null
          email_id: string | null
          email_last_clicked_at: string | null
          emailed_at: string | null
          id: string
          minutes: number
          model: Json
          parent_id: string
          questions: number
          unsubscribe_hash: string | null
        }
        Insert: {
          alert_error?: string | null
          alerted_at?: string | null
          assessment_id: string
          child_id: string
          created_at?: string
          email_clicks?: number
          email_error?: string | null
          email_first_clicked_at?: string | null
          email_id?: string | null
          email_last_clicked_at?: string | null
          emailed_at?: string | null
          id?: string
          minutes: number
          model: Json
          parent_id: string
          questions: number
          unsubscribe_hash?: string | null
        }
        Update: {
          alert_error?: string | null
          alerted_at?: string | null
          assessment_id?: string
          child_id?: string
          created_at?: string
          email_clicks?: number
          email_error?: string | null
          email_first_clicked_at?: string | null
          email_id?: string | null
          email_last_clicked_at?: string | null
          emailed_at?: string | null
          id?: string
          minutes?: number
          model?: Json
          parent_id?: string
          questions?: number
          unsubscribe_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_calibrations: {
        Row: {
          attempts: number
          created_at: string
          finished_at: string | null
          lease_token: string
          lease_until: string
          parent_id: string
          photo_id: string
          printed_revision: string
          result: Json | null
          state: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          lease_token: string
          lease_until: string
          parent_id: string
          photo_id: string
          printed_revision: string
          result?: Json | null
          state: string
        }
        Update: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          lease_token?: string
          lease_until?: string
          parent_id?: string
          photo_id?: string
          printed_revision?: string
          result?: Json | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_calibration_photo"
            columns: ["photo_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "scan_photos"
            referencedColumns: ["id", "parent_id"]
          },
        ]
      }
      scan_limits: {
        Row: {
          active_jobs: number
          concurrent_uploads: number
          decoded_pixels: number
          family_bytes: number
          input_bytes: number
          output_bytes: number
          per_day: number
          per_ten_minutes: number
          queued_jobs: number
          singleton: boolean
        }
        Insert: {
          active_jobs?: number
          concurrent_uploads?: number
          decoded_pixels?: number
          family_bytes?: number
          input_bytes?: number
          output_bytes?: number
          per_day?: number
          per_ten_minutes?: number
          queued_jobs?: number
          singleton?: boolean
        }
        Update: {
          active_jobs?: number
          concurrent_uploads?: number
          decoded_pixels?: number
          family_bytes?: number
          input_bytes?: number
          output_bytes?: number
          per_day?: number
          per_ten_minutes?: number
          queued_jobs?: number
          singleton?: boolean
        }
        Relationships: []
      }
      scan_link_emails: {
        Row: {
          child_id: string
          created_at: string
          email_id: string | null
          error: string | null
          id: string
          parent_id: string
          status: string
        }
        Insert: {
          child_id: string
          created_at?: string
          email_id?: string | null
          error?: string | null
          id?: string
          parent_id: string
          status?: string
        }
        Update: {
          child_id?: string
          created_at?: string
          email_id?: string | null
          error?: string | null
          id?: string
          parent_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_link_emails_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_link_emails_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_mark_changes: {
        Row: {
          actor: string
          admin_id: string | null
          changed_at: string
          child_id: string
          current: Json
          from_version: number
          id: number
          item_id: string
          parent_id: string
          previous: Json
          to_version: number
        }
        Insert: {
          actor?: string
          admin_id?: string | null
          changed_at?: string
          child_id: string
          current: Json
          from_version: number
          id?: never
          item_id: string
          parent_id: string
          previous: Json
          to_version: number
        }
        Update: {
          actor?: string
          admin_id?: string | null
          changed_at?: string
          child_id?: string
          current?: Json
          from_version?: number
          id?: never
          item_id?: string
          parent_id?: string
          previous?: Json
          to_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scan_mark_changes_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "scan_mark_changes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "scan_marking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_mark_changes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_marking_cursor: {
        Row: {
          after_id: string | null
          singleton: boolean
        }
        Insert: {
          after_id?: string | null
          singleton?: boolean
        }
        Update: {
          after_id?: string | null
          singleton?: boolean
        }
        Relationships: []
      }
      scan_marking_dispatches: {
        Row: {
          attempt: number
          child_id: string
          id: string
          parent_id: string
          photo_id: string
        }
        Insert: {
          attempt: number
          child_id: string
          id: string
          parent_id: string
          photo_id: string
        }
        Update: {
          attempt?: number
          child_id?: string
          id?: string
          parent_id?: string
          photo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_marking_dispatches_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "scan_marking_dispatches_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "scan_marking_spend"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_marking_dispatches_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_marking_dispatches_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "scan_marking_jobs"
            referencedColumns: ["photo_id"]
          },
        ]
      }
      scan_marking_evaluation_attempts: {
        Row: {
          attempt_hash: string
          dispatch_id: string
          endpoint: string
          evidence_hash: string
          pixels: number
          run_hash: string
        }
        Insert: {
          attempt_hash: string
          dispatch_id: string
          endpoint: string
          evidence_hash: string
          pixels: number
          run_hash: string
        }
        Update: {
          attempt_hash?: string
          dispatch_id?: string
          endpoint?: string
          evidence_hash?: string
          pixels?: number
          run_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_marking_evaluation_attempts_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: true
            referencedRelation: "scan_marking_spend"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_marking_evaluation_attempts_run_hash_fkey"
            columns: ["run_hash"]
            isOneToOne: false
            referencedRelation: "scan_marking_evaluations"
            referencedColumns: ["run_hash"]
          },
        ]
      }
      scan_marking_evaluation_deferrals: {
        Row: {
          attempt_hash: string
          dispatch_id: string
          policy: string
          received_at_ms: number
          recorded_at: string
          response: Json
          run_hash: string
        }
        Insert: {
          attempt_hash: string
          dispatch_id: string
          policy: string
          received_at_ms: number
          recorded_at?: string
          response: Json
          run_hash: string
        }
        Update: {
          attempt_hash?: string
          dispatch_id?: string
          policy?: string
          received_at_ms?: number
          recorded_at?: string
          response?: Json
          run_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_marking_evaluation_deferrals_attempt_hash_fkey"
            columns: ["attempt_hash"]
            isOneToOne: true
            referencedRelation: "scan_marking_evaluation_attempts"
            referencedColumns: ["attempt_hash"]
          },
          {
            foreignKeyName: "scan_marking_evaluation_deferrals_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: true
            referencedRelation: "scan_marking_evaluation_attempts"
            referencedColumns: ["dispatch_id"]
          },
          {
            foreignKeyName: "scan_marking_evaluation_deferrals_run_hash_fkey"
            columns: ["run_hash"]
            isOneToOne: false
            referencedRelation: "scan_marking_evaluations"
            referencedColumns: ["run_hash"]
          },
        ]
      }
      scan_marking_evaluation_prices: {
        Row: {
          enabled: boolean
          endpoint: string
          evidence: string
          evidence_hash: string
          max_pixels: number
          maximum_micros: number
          model: string
          verified_at: string
        }
        Insert: {
          enabled?: boolean
          endpoint: string
          evidence: string
          evidence_hash: string
          max_pixels: number
          maximum_micros: number
          model: string
          verified_at: string
        }
        Update: {
          enabled?: boolean
          endpoint?: string
          evidence?: string
          evidence_hash?: string
          max_pixels?: number
          maximum_micros?: number
          model?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_marking_evaluation_prices_model_fkey"
            columns: ["model"]
            isOneToOne: false
            referencedRelation: "scan_marking_prices"
            referencedColumns: ["model"]
          },
        ]
      }
      scan_marking_evaluation_resolutions: {
        Row: {
          actor: string
          amount_micros: number
          attempt_hash: string
          dispatch_id: string
          endpoint: string
          evidence: Json
          evidence_hash: string
          maximum_micros: number
          model: string
          outcome: string
          period: string
          pixels: number
          recorded_at: string
          reserved_micros: number
          run_hash: string
          run_maximum_micros: number
        }
        Insert: {
          actor: string
          amount_micros: number
          attempt_hash: string
          dispatch_id: string
          endpoint: string
          evidence: Json
          evidence_hash: string
          maximum_micros: number
          model: string
          outcome: string
          period: string
          pixels: number
          recorded_at?: string
          reserved_micros: number
          run_hash: string
          run_maximum_micros: number
        }
        Update: {
          actor?: string
          amount_micros?: number
          attempt_hash?: string
          dispatch_id?: string
          endpoint?: string
          evidence?: Json
          evidence_hash?: string
          maximum_micros?: number
          model?: string
          outcome?: string
          period?: string
          pixels?: number
          recorded_at?: string
          reserved_micros?: number
          run_hash?: string
          run_maximum_micros?: number
        }
        Relationships: [
          {
            foreignKeyName: "scan_marking_evaluation_resol_model_endpoint_evidence_hash_fkey"
            columns: ["model", "endpoint", "evidence_hash"]
            isOneToOne: false
            referencedRelation: "scan_marking_evaluation_prices"
            referencedColumns: ["model", "endpoint", "evidence_hash"]
          },
          {
            foreignKeyName: "scan_marking_evaluation_resolutions_attempt_hash_fkey"
            columns: ["attempt_hash"]
            isOneToOne: true
            referencedRelation: "scan_marking_evaluation_attempts"
            referencedColumns: ["attempt_hash"]
          },
          {
            foreignKeyName: "scan_marking_evaluation_resolutions_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: true
            referencedRelation: "scan_marking_evaluation_attempts"
            referencedColumns: ["dispatch_id"]
          },
          {
            foreignKeyName: "scan_marking_evaluation_resolutions_run_hash_fkey"
            columns: ["run_hash"]
            isOneToOne: false
            referencedRelation: "scan_marking_evaluations"
            referencedColumns: ["run_hash"]
          },
        ]
      }
      scan_marking_evaluations: {
        Row: {
          maximum_micros: number
          run_hash: string
        }
        Insert: {
          maximum_micros: number
          run_hash: string
        }
        Update: {
          maximum_micros?: number
          run_hash?: string
        }
        Relationships: []
      }
      scan_marking_items: {
        Row: {
          child_id: string
          event_id: string | null
          evidence_at: string
          expected: Json
          id: string
          item_id: string
          model: string | null
          observation: Json
          original_event: Json | null
          owner_photo: string | null
          page_id: string
          parent_id: string
          printed_revision: string
          prompt: string | null
          result_version: number
          workbook_id: string
        }
        Insert: {
          child_id: string
          event_id?: string | null
          evidence_at?: string
          expected: Json
          id?: string
          item_id: string
          model?: string | null
          observation: Json
          original_event?: Json | null
          owner_photo?: string | null
          page_id: string
          parent_id: string
          printed_revision: string
          prompt?: string | null
          result_version?: number
          workbook_id: string
        }
        Update: {
          child_id?: string
          event_id?: string | null
          evidence_at?: string
          expected?: Json
          id?: string
          item_id?: string
          model?: string | null
          observation?: Json
          original_event?: Json | null
          owner_photo?: string | null
          page_id?: string
          parent_id?: string
          printed_revision?: string
          prompt?: string | null
          result_version?: number
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_marking_items_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "scan_marking_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "learning_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_marking_items_page_id_workbook_id_parent_id_fkey"
            columns: ["page_id", "workbook_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "workbook_pages"
            referencedColumns: ["id", "workbook_id", "parent_id"]
          },
          {
            foreignKeyName: "scan_marking_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_marking_jobs: {
        Row: {
          blocked_reason: string | null
          child_id: string
          created_at: string
          dispatches: number
          extraction: Json | null
          frame_hash: string
          item_versions: Json
          lease_token: string | null
          lease_until: string | null
          model: string | null
          page_id: string
          parent_id: string
          photo_id: string
          printed_revision: string
          prompt: string | null
          state: string
          workbook_id: string
        }
        Insert: {
          blocked_reason?: string | null
          child_id: string
          created_at?: string
          dispatches?: number
          extraction?: Json | null
          frame_hash: string
          item_versions?: Json
          lease_token?: string | null
          lease_until?: string | null
          model?: string | null
          page_id: string
          parent_id: string
          photo_id: string
          printed_revision: string
          prompt?: string | null
          state?: string
          workbook_id: string
        }
        Update: {
          blocked_reason?: string | null
          child_id?: string
          created_at?: string
          dispatches?: number
          extraction?: Json | null
          frame_hash?: string
          item_versions?: Json
          lease_token?: string | null
          lease_until?: string | null
          model?: string | null
          page_id?: string
          parent_id?: string
          photo_id?: string
          printed_revision?: string
          prompt?: string | null
          state?: string
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_marking_jobs_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "scan_marking_jobs_page_id_workbook_id_parent_id_fkey"
            columns: ["page_id", "workbook_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "workbook_pages"
            referencedColumns: ["id", "workbook_id", "parent_id"]
          },
          {
            foreignKeyName: "scan_marking_jobs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_marking_jobs_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: true
            referencedRelation: "scan_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_marking_prices: {
        Row: {
          enabled: boolean
          evidence: string | null
          max_pixels: number
          max_tokens: number
          maximum_micros: number | null
          model: string
          verified_at: string | null
        }
        Insert: {
          enabled?: boolean
          evidence?: string | null
          max_pixels?: number
          max_tokens?: number
          maximum_micros?: number | null
          model: string
          verified_at?: string | null
        }
        Update: {
          enabled?: boolean
          evidence?: string | null
          max_pixels?: number
          max_tokens?: number
          maximum_micros?: number | null
          model?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      scan_marking_queue_cursor: {
        Row: {
          after_id: string | null
          after_sent_at: string | null
          singleton: boolean
        }
        Insert: {
          after_id?: string | null
          after_sent_at?: string | null
          singleton?: boolean
        }
        Update: {
          after_id?: string | null
          after_sent_at?: string | null
          singleton?: boolean
        }
        Relationships: []
      }
      scan_marking_revisions: {
        Row: {
          child_id: string
          parent_id: string
          profile_revision: number
          revision: number
        }
        Insert: {
          child_id: string
          parent_id: string
          profile_revision?: number
          revision?: number
        }
        Update: {
          child_id?: string
          parent_id?: string
          profile_revision?: number
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "scan_marking_revisions_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "scan_marking_revisions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_marking_spend: {
        Row: {
          charged_micros: number | null
          created_at: string
          id: string
          model: string
          period: string
          reserved_micros: number
          settled_at: string | null
        }
        Insert: {
          charged_micros?: number | null
          created_at?: string
          id?: string
          model: string
          period: string
          reserved_micros: number
          settled_at?: string | null
        }
        Update: {
          charged_micros?: number | null
          created_at?: string
          id?: string
          model?: string
          period?: string
          reserved_micros?: number
          settled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_marking_spend_model_fkey"
            columns: ["model"]
            isOneToOne: false
            referencedRelation: "scan_marking_prices"
            referencedColumns: ["model"]
          },
        ]
      }
      scan_photo_notices: {
        Row: {
          acknowledged_at: string
          parent_id: string
        }
        Insert: {
          acknowledged_at?: string
          parent_id: string
        }
        Update: {
          acknowledged_at?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_photo_notices_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: true
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_photos: {
        Row: {
          child_id: string
          created_at: string
          expires_at: string
          height: number | null
          id: string
          lease_until: string
          page_id: string | null
          parent_id: string
          printed_revision: string | null
          reserved_bytes: number
          sent_at: string | null
          state: string
          stored_bytes: number
          terminal_at: string | null
          width: number | null
          workbook_id: string | null
        }
        Insert: {
          child_id: string
          created_at?: string
          expires_at?: string
          height?: number | null
          id: string
          lease_until?: string
          page_id?: string | null
          parent_id: string
          printed_revision?: string | null
          reserved_bytes: number
          sent_at?: string | null
          state?: string
          stored_bytes?: number
          terminal_at?: string | null
          width?: number | null
          workbook_id?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string
          expires_at?: string
          height?: number | null
          id?: string
          lease_until?: string
          page_id?: string | null
          parent_id?: string
          printed_revision?: string | null
          reserved_bytes?: number
          sent_at?: string | null
          state?: string
          stored_bytes?: number
          terminal_at?: string | null
          width?: number | null
          workbook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_child_family"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "scan_page_family"
            columns: ["page_id", "workbook_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "workbook_pages"
            referencedColumns: ["id", "workbook_id", "parent_id"]
          },
          {
            foreignKeyName: "scan_photos_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_in_links: {
        Row: {
          child_id: string
          created_at: string
          expires_at: string
          id: string
          parent_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          child_id: string
          created_at?: string
          expires_at: string
          id?: string
          parent_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          parent_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sign_in_links_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sign_in_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_heard: {
        Row: {
          channel: string
          created_at: string
          detail: string | null
          id: number
          ref: string
        }
        Insert: {
          channel: string
          created_at?: string
          detail?: string | null
          id?: never
          ref: string
        }
        Update: {
          channel?: string
          created_at?: string
          detail?: string | null
          id?: never
          ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "signup_heard_ref_fkey"
            columns: ["ref"]
            isOneToOne: false
            referencedRelation: "signups"
            referencedColumns: ["ref"]
          },
        ]
      }
      signups: {
        Row: {
          age: number | null
          booking_customer_id: string | null
          booking_state: string | null
          created_at: string
          curriculum: string | null
          email: string
          grade: number | null
          id: number
          name: string
          plan: string
          postal: string
          price: number
          ref: string | null
          source: Json
          status: string
          subject: string
        }
        Insert: {
          age?: number | null
          booking_customer_id?: string | null
          booking_state?: string | null
          created_at?: string
          curriculum?: string | null
          email: string
          grade?: number | null
          id?: never
          name: string
          plan: string
          postal: string
          price: number
          ref?: string | null
          source?: Json
          status: string
          subject: string
        }
        Update: {
          age?: number | null
          booking_customer_id?: string | null
          booking_state?: string | null
          created_at?: string
          curriculum?: string | null
          email?: string
          grade?: number | null
          id?: never
          name?: string
          plan?: string
          postal?: string
          price?: number
          ref?: string | null
          source?: Json
          status?: string
          subject?: string
        }
        Relationships: []
      }
      skill_state_history: {
        Row: {
          changed_at: string
          child_id: string
          evidence_at: string | null
          evidence_source: string
          id: number
          parent_id: string
          reason: string
          standard: string
          state: string
        }
        Insert: {
          changed_at?: string
          child_id: string
          evidence_at?: string | null
          evidence_source: string
          id?: never
          parent_id: string
          reason: string
          standard: string
          state: string
        }
        Update: {
          changed_at?: string
          child_id?: string
          evidence_at?: string | null
          evidence_source?: string
          id?: never
          parent_id?: string
          reason?: string
          standard?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_state_history_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "skill_state_history_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      test_accounts: {
        Row: {
          marked_at: string
          marked_by: string
          parent_id: string
        }
        Insert: {
          marked_at?: string
          marked_by?: string
          parent_id: string
        }
        Update: {
          marked_at?: string
          marked_by?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: true
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_joins: {
        Row: {
          child_id: string
          created_at: string
          id: string
          parent_id: string
          province: string
          report_id: string | null
        }
        Insert: {
          child_id: string
          created_at?: string
          id?: string
          parent_id: string
          province: string
          report_id?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string
          id?: string
          parent_id?: string
          province?: string
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_joins_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: true
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_joins_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_joins_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      work_reviews: {
        Row: {
          assessment_id: string
          comment: string
          confidence: string
          created_at: string
          error_type: string
          id: string
          kind: string
          model: string
          parent_id: string
          question_id: string
          score: number
        }
        Insert: {
          assessment_id: string
          comment: string
          confidence: string
          created_at?: string
          error_type: string
          id?: string
          kind: string
          model: string
          parent_id: string
          question_id: string
          score: number
        }
        Update: {
          assessment_id?: string
          comment?: string
          confidence?: string
          created_at?: string
          error_type?: string
          id?: string
          kind?: string
          model?: string
          parent_id?: string
          question_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_reviews_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_reviews_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          at: string
          child_id: string
          detail: Json
          draft_id: string | null
          id: number
          parent_id: string
          run_id: string | null
          workbook_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          at?: string
          child_id: string
          detail?: Json
          draft_id?: string | null
          id?: never
          parent_id: string
          run_id?: string | null
          workbook_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          at?: string
          child_id?: string
          detail?: Json
          draft_id?: string | null
          id?: never
          parent_id?: string
          run_id?: string | null
          workbook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workbook_audit_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_audit_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "workbook_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_audit_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_audit_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_audit_workbook_id_fkey"
            columns: ["workbook_id"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_book1_baselines: {
        Row: {
          actor_id: string
          boundary_at: string
          child_id: string
          created_at: string
          db_content_hash: string
          db_frame_hash: string
          db_rendering_hash: string
          draft_id: string
          draft_revision: number
          engine: string
          id: string
          initial_activity: Json
          parent_id: string
          payload: string
          payload_hash: string
          plan_input_hash: string
          planning_kind: string
          print_hash: string
          printed_revision: string
          run_id: string
        }
        Insert: {
          actor_id: string
          boundary_at?: string
          child_id: string
          created_at?: string
          db_content_hash: string
          db_frame_hash: string
          db_rendering_hash: string
          draft_id: string
          draft_revision: number
          engine: string
          id: string
          initial_activity: Json
          parent_id: string
          payload: string
          payload_hash: string
          plan_input_hash: string
          planning_kind: string
          print_hash: string
          printed_revision: string
          run_id: string
        }
        Update: {
          actor_id?: string
          boundary_at?: string
          child_id?: string
          created_at?: string
          db_content_hash?: string
          db_frame_hash?: string
          db_rendering_hash?: string
          draft_id?: string
          draft_revision?: number
          engine?: string
          id?: string
          initial_activity?: Json
          parent_id?: string
          payload?: string
          payload_hash?: string
          plan_input_hash?: string
          planning_kind?: string
          print_hash?: string
          printed_revision?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_book1_baselines_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_book1_baselines_draft_id_draft_revision_fkey"
            columns: ["draft_id", "draft_revision"]
            isOneToOne: true
            referencedRelation: "workbook_draft_revisions"
            referencedColumns: ["draft_id", "revision"]
          },
          {
            foreignKeyName: "workbook_book1_baselines_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "workbook_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_book1_baselines_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_book1_baselines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_comments: {
        Row: {
          actor_email: string
          actor_id: string
          after_value: Json | null
          batch_id: string | null
          before_value: Json | null
          child_id: string
          client_request_key: string | null
          created_at: string
          draft_id: string
          error: string | null
          id: string
          item: Json | null
          note: string
          page_number: number
          parent_id: string
          question_number: number | null
          request_key: string | null
          result_note: string | null
          revision: number
          route: string
          status: string
          x: number
          y: number
        }
        Insert: {
          actor_email: string
          actor_id: string
          after_value?: Json | null
          batch_id?: string | null
          before_value?: Json | null
          child_id: string
          client_request_key?: string | null
          created_at?: string
          draft_id: string
          error?: string | null
          id?: string
          item?: Json | null
          note: string
          page_number: number
          parent_id: string
          question_number?: number | null
          request_key?: string | null
          result_note?: string | null
          revision: number
          route?: string
          status?: string
          x: number
          y: number
        }
        Update: {
          actor_email?: string
          actor_id?: string
          after_value?: Json | null
          batch_id?: string | null
          before_value?: Json | null
          child_id?: string
          client_request_key?: string | null
          created_at?: string
          draft_id?: string
          error?: string | null
          id?: string
          item?: Json | null
          note?: string
          page_number?: number
          parent_id?: string
          question_number?: number | null
          request_key?: string | null
          result_note?: string | null
          revision?: number
          route?: string
          status?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "workbook_comments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "workbook_edits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_comments_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_comments_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "workbook_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_delivery_corrections: {
        Row: {
          actor_id: string
          audit_id: number
          child_id: string
          delivered_at: string
          id: string
          local_time: string
          number: number
          parent_id: string
          previous_audit_id: number
          previous_delivered_at: string
          reason: string
          recorded_at: string
          workbook_id: string
        }
        Insert: {
          actor_id: string
          audit_id: number
          child_id: string
          delivered_at: string
          id: string
          local_time: string
          number: number
          parent_id: string
          previous_audit_id: number
          previous_delivered_at: string
          reason: string
          recorded_at?: string
          workbook_id: string
        }
        Update: {
          actor_id?: string
          audit_id?: number
          child_id?: string
          delivered_at?: string
          id?: string
          local_time?: string
          number?: number
          parent_id?: string
          previous_audit_id?: number
          previous_delivered_at?: string
          reason?: string
          recorded_at?: string
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_delivery_corrections_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: true
            referencedRelation: "workbook_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_delivery_corrections_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_delivery_corrections_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_delivery_corrections_previous_audit_id_fkey"
            columns: ["previous_audit_id"]
            isOneToOne: false
            referencedRelation: "workbook_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_delivery_corrections_workbook_id_fkey"
            columns: ["workbook_id"]
            isOneToOne: false
            referencedRelation: "workbook_delivery_receipts"
            referencedColumns: ["workbook_id"]
          },
          {
            foreignKeyName: "workbook_delivery_corrections_workbook_id_parent_id_child__fkey"
            columns: ["workbook_id", "parent_id", "child_id", "number"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "parent_id", "child_id", "number"]
          },
        ]
      }
      workbook_delivery_receipts: {
        Row: {
          actor_id: string
          audit_id: number
          child_id: string
          delivered_at: string
          local_time: string
          number: number
          parent_id: string
          recorded_at: string
          time_zone: string
          workbook_id: string
          zone_override: boolean
        }
        Insert: {
          actor_id: string
          audit_id: number
          child_id: string
          delivered_at: string
          local_time: string
          number: number
          parent_id: string
          recorded_at?: string
          time_zone: string
          workbook_id: string
          zone_override: boolean
        }
        Update: {
          actor_id?: string
          audit_id?: number
          child_id?: string
          delivered_at?: string
          local_time?: string
          number?: number
          parent_id?: string
          recorded_at?: string
          time_zone?: string
          workbook_id?: string
          zone_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "workbook_delivery_receipts_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: true
            referencedRelation: "workbook_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_delivery_receipts_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_delivery_receipts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_delivery_receipts_workbook_id_parent_id_child_id__fkey"
            columns: ["workbook_id", "parent_id", "child_id", "number"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "parent_id", "child_id", "number"]
          },
        ]
      }
      workbook_draft_revisions: {
        Row: {
          by_email: string | null
          by_user: string | null
          child_id: string
          content: Json | null
          created_at: string
          draft_id: string
          kind: string
          note: string | null
          parent_id: string
          render_problems: Json
          rendering: Json | null
          revision: number
        }
        Insert: {
          by_email?: string | null
          by_user?: string | null
          child_id: string
          content?: Json | null
          created_at?: string
          draft_id: string
          kind: string
          note?: string | null
          parent_id: string
          render_problems?: Json
          rendering?: Json | null
          revision: number
        }
        Update: {
          by_email?: string | null
          by_user?: string | null
          child_id?: string
          content?: Json | null
          created_at?: string
          draft_id?: string
          kind?: string
          note?: string | null
          parent_id?: string
          render_problems?: Json
          rendering?: Json | null
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "workbook_draft_revisions_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_draft_revisions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "workbook_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_draft_revisions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_drafts: {
        Row: {
          child_id: string
          created_at: string
          draft: Json
          failed: number
          failed_pages: number
          id: string
          levels: number[]
          model: string
          not_checked: number
          number: number
          pages: number
          parent_id: string
          profile_build: string | null
          questions: number
          schema_version: number
        }
        Insert: {
          child_id: string
          created_at?: string
          draft: Json
          failed: number
          failed_pages: number
          id: string
          levels: number[]
          model: string
          not_checked: number
          number: number
          pages: number
          parent_id: string
          profile_build?: string | null
          questions: number
          schema_version: number
        }
        Update: {
          child_id?: string
          created_at?: string
          draft?: Json
          failed?: number
          failed_pages?: number
          id?: string
          levels?: number[]
          model?: string
          not_checked?: number
          number?: number
          pages?: number
          parent_id?: string
          profile_build?: string | null
          questions?: number
          schema_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workbook_drafts_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_drafts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_edit_calls: {
        Row: {
          attempt: number
          batch_id: string
          completed_at: string | null
          dispatched_at: string
          kind: string
          lease: string
          page_number: number
          question_id: string
          request_hash: string
          result: Json | null
        }
        Insert: {
          attempt: number
          batch_id: string
          completed_at?: string | null
          dispatched_at?: string
          kind: string
          lease: string
          page_number: number
          question_id: string
          request_hash: string
          result?: Json | null
        }
        Update: {
          attempt?: number
          batch_id?: string
          completed_at?: string | null
          dispatched_at?: string
          kind?: string
          lease?: string
          page_number?: number
          question_id?: string
          request_hash?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "workbook_edit_calls_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "workbook_edits"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_edits: {
        Row: {
          action: string
          actor_email: string
          actor_id: string
          after_page: Json | null
          base_revision: number
          before_page: Json | null
          checkpoints: Json
          child_id: string
          created_at: string
          draft_id: string
          edit_kind: string
          error: string | null
          finished_at: string | null
          frame: Json | null
          heartbeat_at: string
          id: string
          item: Json | null
          layout_plan: Json | null
          lease: string | null
          note: string
          page_number: number
          parent_id: string
          question_number: number | null
          revision: number | null
          runner: string
          status: string
        }
        Insert: {
          action: string
          actor_email: string
          actor_id: string
          after_page?: Json | null
          base_revision: number
          before_page?: Json | null
          checkpoints?: Json
          child_id: string
          created_at?: string
          draft_id: string
          edit_kind?: string
          error?: string | null
          finished_at?: string | null
          frame?: Json | null
          heartbeat_at?: string
          id?: string
          item?: Json | null
          layout_plan?: Json | null
          lease?: string | null
          note: string
          page_number: number
          parent_id: string
          question_number?: number | null
          revision?: number | null
          runner: string
          status?: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string
          after_page?: Json | null
          base_revision?: number
          before_page?: Json | null
          checkpoints?: Json
          child_id?: string
          created_at?: string
          draft_id?: string
          edit_kind?: string
          error?: string | null
          finished_at?: string | null
          frame?: Json | null
          heartbeat_at?: string
          id?: string
          item?: Json | null
          layout_plan?: Json | null
          lease?: string | null
          note?: string
          page_number?: number
          parent_id?: string
          question_number?: number | null
          revision?: number | null
          runner?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_edits_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_edits_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "workbook_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_edits_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_emails: {
        Row: {
          attempts: number
          card_setup_id: string
          child_id: string
          claim_token: string | null
          claimed_at: string | null
          created_at: string
          delivery: Json
          email_id: string | null
          error: string | null
          html_body: string | null
          id: string
          kind: string
          parent_id: string
          sent_at: string | null
          status: string
          subject: string | null
          text_body: string | null
          to_address: string | null
          updated_at: string
          workbook_number: number
        }
        Insert: {
          attempts?: number
          card_setup_id: string
          child_id: string
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          delivery?: Json
          email_id?: string | null
          error?: string | null
          html_body?: string | null
          id?: string
          kind: string
          parent_id: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          text_body?: string | null
          to_address?: string | null
          updated_at?: string
          workbook_number: number
        }
        Update: {
          attempts?: number
          card_setup_id?: string
          child_id?: string
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          delivery?: Json
          email_id?: string | null
          error?: string | null
          html_body?: string | null
          id?: string
          kind?: string
          parent_id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          text_body?: string | null
          to_address?: string | null
          updated_at?: string
          workbook_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "workbook_emails_card_setup_id_fkey"
            columns: ["card_setup_id"]
            isOneToOne: false
            referencedRelation: "card_setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_emails_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_emails_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_instructions: {
        Row: {
          child_id: string
          instructions: Json
          parent_id: string
          schema_version: number
          updated_at: string
          updated_by: string | null
          updated_by_email: string | null
        }
        Insert: {
          child_id: string
          instructions: Json
          parent_id: string
          schema_version?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Update: {
          child_id?: string
          instructions?: Json
          parent_id?: string
          schema_version?: number
          updated_at?: string
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workbook_instructions_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_instructions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_pages: {
        Row: {
          created_at: string
          day_label: string | null
          id: string
          image_height: number | null
          image_path: string | null
          image_width: number | null
          page_number: number
          page_type: string
          parent_id: string
          print_contract: Json | null
          qr_token: string
          workbook_id: string
        }
        Insert: {
          created_at?: string
          day_label?: string | null
          id?: string
          image_height?: number | null
          image_path?: string | null
          image_width?: number | null
          page_number: number
          page_type: string
          parent_id: string
          print_contract?: Json | null
          qr_token: string
          workbook_id: string
        }
        Update: {
          created_at?: string
          day_label?: string | null
          id?: string
          image_height?: number | null
          image_path?: string | null
          image_width?: number | null
          page_number?: number
          page_type?: string
          parent_id?: string
          print_contract?: Json | null
          qr_token?: string
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_pages_workbook_fkey"
            columns: ["workbook_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "parent_id"]
          },
        ]
      }
      workbook_plan_previews: {
        Row: {
          actor_id: string
          child_id: string
          created_at: string
          cutoff: string
          engine: string
          id: string
          number: number
          parent_id: string
          payload: string
          payload_hash: string
          printed_revision: string
          workbook_id: string
        }
        Insert: {
          actor_id: string
          child_id: string
          created_at?: string
          cutoff: string
          engine: string
          id: string
          number: number
          parent_id: string
          payload: string
          payload_hash: string
          printed_revision: string
          workbook_id: string
        }
        Update: {
          actor_id?: string
          child_id?: string
          created_at?: string
          cutoff?: string
          engine?: string
          id?: string
          number?: number
          parent_id?: string
          payload?: string
          payload_hash?: string
          printed_revision?: string
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_plan_previews_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_plan_previews_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_plan_previews_workbook_id_parent_id_child_id_numb_fkey"
            columns: ["workbook_id", "parent_id", "child_id", "number"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "parent_id", "child_id", "number"]
          },
        ]
      }
      workbook_questions: {
        Row: {
          box_height: number
          box_width: number
          box_x: number
          box_y: number
          created_at: string
          id: string
          package: Json
          page_id: string
          parent_id: string
          question_key: string
          question_number: number
          regions: Json | null
          schema_version: number
          teaching: Json | null
          workbook_id: string
        }
        Insert: {
          box_height: number
          box_width: number
          box_x: number
          box_y: number
          created_at?: string
          id?: string
          package: Json
          page_id: string
          parent_id: string
          question_key: string
          question_number: number
          regions?: Json | null
          schema_version: number
          teaching?: Json | null
          workbook_id: string
        }
        Update: {
          box_height?: number
          box_width?: number
          box_x?: number
          box_y?: number
          created_at?: string
          id?: string
          package?: Json
          page_id?: string
          parent_id?: string
          question_key?: string
          question_number?: number
          regions?: Json | null
          schema_version?: number
          teaching?: Json | null
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_questions_page_fkey"
            columns: ["page_id", "workbook_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "workbook_pages"
            referencedColumns: ["id", "workbook_id", "parent_id"]
          },
        ]
      }
      workbook_restart_requests: {
        Row: {
          card_setup_id: string
          child_id: string
          generation: number
          parent_id: string
          requested_at: string
          run_id: string | null
        }
        Insert: {
          card_setup_id: string
          child_id: string
          generation: number
          parent_id: string
          requested_at?: string
          run_id?: string | null
        }
        Update: {
          card_setup_id?: string
          child_id?: string
          generation?: number
          parent_id?: string
          requested_at?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workbook_restart_requests_card_setup_id_fkey"
            columns: ["card_setup_id"]
            isOneToOne: false
            referencedRelation: "card_setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_restart_requests_card_setup_id_generation_fkey"
            columns: ["card_setup_id", "generation"]
            isOneToOne: true
            referencedRelation: "plan_starts"
            referencedColumns: ["card_setup_id", "generation"]
          },
          {
            foreignKeyName: "workbook_restart_requests_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_restart_requests_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_restart_requests_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_restart_requests_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_run_ai_calls: {
        Row: {
          call_id: string | null
          child_id: string
          created_at: string
          id: number
          kind: string
          model: string
          ms: number
          note: string | null
          outcome: string
          parent_id: string
          provider: string
          requests: number | null
          run_id: string
          usd: number | null
        }
        Insert: {
          call_id?: string | null
          child_id: string
          created_at?: string
          id?: never
          kind: string
          model: string
          ms: number
          note?: string | null
          outcome: string
          parent_id: string
          provider: string
          requests?: number | null
          run_id: string
          usd?: number | null
        }
        Update: {
          call_id?: string | null
          child_id?: string
          created_at?: string
          id?: never
          kind?: string
          model?: string
          ms?: number
          note?: string | null
          outcome?: string
          parent_id?: string
          provider?: string
          requests?: number | null
          run_id?: string
          usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workbook_run_ai_calls_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_run_ai_calls_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_run_ai_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_run_attempts: {
        Row: {
          attempts: number
          child_id: string
          page: number
          parent_id: string
          run_id: string
          slot: string
          updated_at: string
        }
        Insert: {
          attempts: number
          child_id: string
          page: number
          parent_id: string
          run_id: string
          slot: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          child_id?: string
          page?: number
          parent_id?: string
          run_id?: string
          slot?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_run_attempts_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_run_attempts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_run_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_run_calls: {
        Row: {
          call: Json
          child_id: string
          created_at: string
          page: number
          parent_id: string
          run_id: string
          seq: number
        }
        Insert: {
          call: Json
          child_id: string
          created_at?: string
          page: number
          parent_id: string
          run_id: string
          seq: number
        }
        Update: {
          call?: Json
          child_id?: string
          created_at?: string
          page?: number
          parent_id?: string
          run_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "workbook_run_calls_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_run_calls_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_run_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_run_frames: {
        Row: {
          child_id: string
          created_at: string
          frame: Json
          parent_id: string
          run_id: string
        }
        Insert: {
          child_id: string
          created_at?: string
          frame: Json
          parent_id: string
          run_id: string
        }
        Update: {
          child_id?: string
          created_at?: string
          frame?: Json
          parent_id?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_run_frames_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_run_frames_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_run_frames_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_run_pages: {
        Row: {
          child_id: string
          created_at: string
          number: number
          page: Json
          parent_id: string
          run_id: string
        }
        Insert: {
          child_id: string
          created_at?: string
          number: number
          page: Json
          parent_id: string
          run_id: string
        }
        Update: {
          child_id?: string
          created_at?: string
          number?: number
          page?: Json
          parent_id?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_run_pages_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_run_pages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_run_pages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_run_solves: {
        Row: {
          call_key: string | null
          child_id: string
          created_at: string
          id: number
          log: Json
          model: string
          ms: number
          parent_id: string
          question_id: string
          run_id: string
          usd: number | null
          verdict: string
        }
        Insert: {
          call_key?: string | null
          child_id: string
          created_at?: string
          id?: never
          log: Json
          model: string
          ms: number
          parent_id: string
          question_id: string
          run_id: string
          usd?: number | null
          verdict: string
        }
        Update: {
          call_key?: string | null
          child_id?: string
          created_at?: string
          id?: never
          log?: Json
          model?: string
          ms?: number
          parent_id?: string
          question_id?: string
          run_id?: string
          usd?: number | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_run_solves_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_run_solves_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_run_solves_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_runs: {
        Row: {
          ai_off: Json
          attempts: number
          child_id: string
          created_at: string
          done_pages: number | null
          draft_id: string | null
          draft_key: string
          error: string | null
          errors: Json
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          lease: string | null
          max_attempts: number
          number: number
          parent_id: string
          resumes: number
          runner: string
          snapshot_id: string | null
          started_at: string | null
          started_by: string | null
          started_by_email: string | null
          status: string
          step: string | null
          stopped_by_email: string | null
          total_pages: number | null
        }
        Insert: {
          ai_off?: Json
          attempts?: number
          child_id: string
          created_at?: string
          done_pages?: number | null
          draft_id?: string | null
          draft_key?: string
          error?: string | null
          errors?: Json
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          lease?: string | null
          max_attempts: number
          number: number
          parent_id: string
          resumes?: number
          runner?: string
          snapshot_id?: string | null
          started_at?: string | null
          started_by?: string | null
          started_by_email?: string | null
          status?: string
          step?: string | null
          stopped_by_email?: string | null
          total_pages?: number | null
        }
        Update: {
          ai_off?: Json
          attempts?: number
          child_id?: string
          created_at?: string
          done_pages?: number | null
          draft_id?: string | null
          draft_key?: string
          error?: string | null
          errors?: Json
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          lease?: string | null
          max_attempts?: number
          number?: number
          parent_id?: string
          resumes?: number
          runner?: string
          snapshot_id?: string | null
          started_at?: string | null
          started_by?: string | null
          started_by_email?: string | null
          status?: string
          step?: string | null
          stopped_by_email?: string | null
          total_pages?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workbook_runs_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_runs_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "workbook_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_runs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "next_book_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_scan_backstop_holds: {
        Row: {
          backstop_at: string
          child_id: string
          delivered_at: string
          delivery_audit_id: number
          held_at: string
          parent_id: string
          printed_revision: string
          reason: string
          workbook_id: string
        }
        Insert: {
          backstop_at: string
          child_id: string
          delivered_at: string
          delivery_audit_id: number
          held_at?: string
          parent_id: string
          printed_revision: string
          reason?: string
          workbook_id: string
        }
        Update: {
          backstop_at?: string
          child_id?: string
          delivered_at?: string
          delivery_audit_id?: number
          held_at?: string
          parent_id?: string
          printed_revision?: string
          reason?: string
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_backstop_holds_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_backstop_holds_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_backstop_holds_workbook_id_fkey"
            columns: ["workbook_id"]
            isOneToOne: false
            referencedRelation: "workbook_delivery_receipts"
            referencedColumns: ["workbook_id"]
          },
        ]
      }
      workbook_scan_clock_requests: {
        Row: {
          child_id: string
          delivered_at: string
          delivery_audit_id: number
          delivery_correction_id: string | null
          number: number
          parent_id: string
          printed_revision: string
          requested_at: string
          time_zone: string
          workbook_id: string
          zone_override: boolean
        }
        Insert: {
          child_id: string
          delivered_at: string
          delivery_audit_id: number
          delivery_correction_id?: string | null
          number: number
          parent_id: string
          printed_revision: string
          requested_at?: string
          time_zone: string
          workbook_id: string
          zone_override: boolean
        }
        Update: {
          child_id?: string
          delivered_at?: string
          delivery_audit_id?: number
          delivery_correction_id?: string | null
          number?: number
          parent_id?: string
          printed_revision?: string
          requested_at?: string
          time_zone?: string
          workbook_id?: string
          zone_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_clock_requests_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_clock_requests_delivery_audit_id_fkey"
            columns: ["delivery_audit_id"]
            isOneToOne: true
            referencedRelation: "workbook_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_clock_requests_delivery_correction_id_fkey"
            columns: ["delivery_correction_id"]
            isOneToOne: false
            referencedRelation: "workbook_delivery_corrections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_clock_requests_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_clock_requests_workbook_id_fkey"
            columns: ["workbook_id"]
            isOneToOne: false
            referencedRelation: "workbook_delivery_receipts"
            referencedColumns: ["workbook_id"]
          },
          {
            foreignKeyName: "workbook_scan_clock_requests_workbook_id_parent_id_child_i_fkey"
            columns: ["workbook_id", "parent_id", "child_id", "number"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "parent_id", "child_id", "number"]
          },
        ]
      }
      workbook_scan_delivery_calendars: {
        Row: {
          backstop_at: string
          child_id: string
          clock_version: string
          delivery_audit_id: number
          parent_id: string
          recorded_at: string
        }
        Insert: {
          backstop_at: string
          child_id: string
          clock_version: string
          delivery_audit_id: number
          parent_id: string
          recorded_at?: string
        }
        Update: {
          backstop_at?: string
          child_id?: string
          clock_version?: string
          delivery_audit_id?: number
          parent_id?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_delivery_calendars_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_delivery_calendars_delivery_audit_id_fkey"
            columns: ["delivery_audit_id"]
            isOneToOne: true
            referencedRelation: "workbook_scan_clock_requests"
            referencedColumns: ["delivery_audit_id"]
          },
          {
            foreignKeyName: "workbook_scan_delivery_calendars_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_scan_inactivity_episodes: {
        Row: {
          activity_key: string
          activity_receipt_id: string | null
          anchor_at: string
          calendar_revision: string
          child_id: string
          clock_context: Json
          clock_version: string
          consumed_at: string | null
          consumed_token: string | null
          created_at: string
          delivery_audit_id: number
          dispatch_count: number
          due_at: string
          id: string
          number: number
          parent_id: string
          printed_revision: string
          refreshed_at: string
          workbook_id: string
        }
        Insert: {
          activity_key: string
          activity_receipt_id?: string | null
          anchor_at: string
          calendar_revision?: string
          child_id: string
          clock_context: Json
          clock_version: string
          consumed_at?: string | null
          consumed_token?: string | null
          created_at?: string
          delivery_audit_id: number
          dispatch_count?: number
          due_at: string
          id?: string
          number: number
          parent_id: string
          printed_revision: string
          refreshed_at?: string
          workbook_id: string
        }
        Update: {
          activity_key?: string
          activity_receipt_id?: string | null
          anchor_at?: string
          calendar_revision?: string
          child_id?: string
          clock_context?: Json
          clock_version?: string
          consumed_at?: string | null
          consumed_token?: string | null
          created_at?: string
          delivery_audit_id?: number
          dispatch_count?: number
          due_at?: string
          id?: string
          number?: number
          parent_id?: string
          printed_revision?: string
          refreshed_at?: string
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_inactivity_epis_workbook_id_parent_id_child__fkey"
            columns: ["workbook_id", "parent_id", "child_id", "number"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "parent_id", "child_id", "number"]
          },
          {
            foreignKeyName: "workbook_scan_inactivity_episodes_activity_receipt_id_fkey"
            columns: ["activity_receipt_id"]
            isOneToOne: false
            referencedRelation: "workbook_scan_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_inactivity_episodes_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_inactivity_episodes_delivery_audit_id_fkey"
            columns: ["delivery_audit_id"]
            isOneToOne: false
            referencedRelation: "workbook_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_inactivity_episodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_scan_pending_items: {
        Row: {
          child_id: string
          expected: Json
          item_id: string
          item_row_id: string
          parent_id: string
          receipt_id: string
          result_version: number
        }
        Insert: {
          child_id: string
          expected: Json
          item_id: string
          item_row_id: string
          parent_id: string
          receipt_id: string
          result_version: number
        }
        Update: {
          child_id?: string
          expected?: Json
          item_id?: string
          item_row_id?: string
          parent_id?: string
          receipt_id?: string
          result_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_pending_items_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_pending_items_item_row_id_fkey"
            columns: ["item_row_id"]
            isOneToOne: false
            referencedRelation: "scan_marking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_pending_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_pending_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "workbook_scan_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_scan_progress_events: {
        Row: {
          admitted_at: string
          child_id: string
          from_version: number
          id: string
          item_id: string
          item_row_id: string
          page_id: string
          parent_id: string
          printed_revision: string
          reason: string
          receipt_id: string
          to_version: number
          workbook_id: string
        }
        Insert: {
          admitted_at?: string
          child_id: string
          from_version: number
          id?: string
          item_id: string
          item_row_id: string
          page_id: string
          parent_id: string
          printed_revision: string
          reason?: string
          receipt_id: string
          to_version: number
          workbook_id: string
        }
        Update: {
          admitted_at?: string
          child_id?: string
          from_version?: number
          id?: string
          item_id?: string
          item_row_id?: string
          page_id?: string
          parent_id?: string
          printed_revision?: string
          reason?: string
          receipt_id?: string
          to_version?: number
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_progress_events_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_progress_events_item_row_id_fkey"
            columns: ["item_row_id"]
            isOneToOne: false
            referencedRelation: "scan_marking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_progress_events_page_id_workbook_id_parent_i_fkey"
            columns: ["page_id", "workbook_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "workbook_pages"
            referencedColumns: ["id", "workbook_id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_progress_events_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_progress_events_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "workbook_scan_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_progress_events_receipt_id_item_row_id_fkey"
            columns: ["receipt_id", "item_row_id"]
            isOneToOne: true
            referencedRelation: "workbook_scan_pending_items"
            referencedColumns: ["receipt_id", "item_row_id"]
          },
        ]
      }
      workbook_scan_receipt_epoch: {
        Row: {
          installed_at: string
          singleton: boolean
        }
        Insert: {
          installed_at?: string
          singleton?: boolean
        }
        Update: {
          installed_at?: string
          singleton?: boolean
        }
        Relationships: []
      }
      workbook_scan_receipts: {
        Row: {
          accepted_at: string
          calibration_token: string
          child_id: string
          id: string
          number: number
          page_id: string
          parent_id: string
          photo_revision: string
          printed_revision: string
          status: string
          workbook_id: string
        }
        Insert: {
          accepted_at?: string
          calibration_token: string
          child_id: string
          id?: string
          number: number
          page_id: string
          parent_id: string
          photo_revision: string
          printed_revision: string
          status?: string
          workbook_id: string
        }
        Update: {
          accepted_at?: string
          calibration_token?: string
          child_id?: string
          id?: string
          number?: number
          page_id?: string
          parent_id?: string
          photo_revision?: string
          printed_revision?: string
          status?: string
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_receipts_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_receipts_page_id_workbook_id_parent_id_fkey"
            columns: ["page_id", "workbook_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "workbook_pages"
            referencedColumns: ["id", "workbook_id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_receipts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_receipts_workbook_id_parent_id_child_id_numb_fkey"
            columns: ["workbook_id", "parent_id", "child_id", "number"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "parent_id", "child_id", "number"]
          },
        ]
      }
      workbook_scan_reminder_attempts: {
        Row: {
          admitted_at: string | null
          attempt: number
          finished_at: string | null
          message_id: string
          parent_id: string
          reserved_at: string
          state: string
          token: string
        }
        Insert: {
          admitted_at?: string | null
          attempt: number
          finished_at?: string | null
          message_id: string
          parent_id: string
          reserved_at?: string
          state: string
          token: string
        }
        Update: {
          admitted_at?: string | null
          attempt?: number
          finished_at?: string | null
          message_id?: string
          parent_id?: string
          reserved_at?: string
          state?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_reminder_attempts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "workbook_scan_reminder_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_reminder_attempts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_scan_reminder_links: {
        Row: {
          calendar_revision: string
          child_id: string
          episode_id: string
          message_id: string
          parent_id: string
          released: boolean
        }
        Insert: {
          calendar_revision: string
          child_id: string
          episode_id: string
          message_id: string
          parent_id: string
          released?: boolean
        }
        Update: {
          calendar_revision?: string
          child_id?: string
          episode_id?: string
          message_id?: string
          parent_id?: string
          released?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_reminder_links_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_reminder_links_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "workbook_scan_inactivity_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_reminder_links_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "workbook_scan_reminder_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_reminder_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_scan_reminder_messages: {
        Row: {
          attempt_count: number
          attempt_token: string
          created_at: string
          email_log_id: string
          id: string
          parent_id: string
          state: string
          updated_at: string
        }
        Insert: {
          attempt_count: number
          attempt_token: string
          created_at?: string
          email_log_id: string
          id?: string
          parent_id: string
          state: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          attempt_token?: string
          created_at?: string
          email_log_id?: string
          id?: string
          parent_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_reminder_messages_email_log_id_fkey"
            columns: ["email_log_id"]
            isOneToOne: true
            referencedRelation: "email_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_reminder_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_scan_trigger_claims: {
        Row: {
          backstop_at: string | null
          child_id: string
          claimed_at: string
          delivered_at: string
          delivery_audit_id: number
          delivery_correction_id: string | null
          effective_at: string
          id: string
          number: number
          parent_id: string
          printed_revision: string
          reason: string
          receipt_ids: string[]
          time_zone: string
          workbook_id: string
          zone_override: boolean
        }
        Insert: {
          backstop_at?: string | null
          child_id: string
          claimed_at?: string
          delivered_at: string
          delivery_audit_id: number
          delivery_correction_id?: string | null
          effective_at: string
          id?: string
          number: number
          parent_id: string
          printed_revision: string
          reason: string
          receipt_ids: string[]
          time_zone: string
          workbook_id: string
          zone_override: boolean
        }
        Update: {
          backstop_at?: string | null
          child_id?: string
          claimed_at?: string
          delivered_at?: string
          delivery_audit_id?: number
          delivery_correction_id?: string | null
          effective_at?: string
          id?: string
          number?: number
          parent_id?: string
          printed_revision?: string
          reason?: string
          receipt_ids?: string[]
          time_zone?: string
          workbook_id?: string
          zone_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "workbook_scan_trigger_claims_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_scan_trigger_claims_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_scan_trigger_claims_workbook_id_fkey"
            columns: ["workbook_id"]
            isOneToOne: true
            referencedRelation: "workbook_delivery_receipts"
            referencedColumns: ["workbook_id"]
          },
          {
            foreignKeyName: "workbook_scan_trigger_claims_workbook_id_parent_id_child_i_fkey"
            columns: ["workbook_id", "parent_id", "child_id", "number"]
            isOneToOne: false
            referencedRelation: "workbooks"
            referencedColumns: ["id", "parent_id", "child_id", "number"]
          },
        ]
      }
      workbook_second_tries: {
        Row: {
          based_on_version: number
          baseline_id: string
          child_id: string
          engine: string
          evidence_reference: string
          help: string
          id: string
          item_id: string
          item_row_id: string
          page_id: string
          parent_id: string
          printed_revision: string
          recorded_at: string
          result: string
          source: string
          workbook_id: string
        }
        Insert: {
          based_on_version: number
          baseline_id: string
          child_id: string
          engine: string
          evidence_reference: string
          help: string
          id: string
          item_id: string
          item_row_id: string
          page_id: string
          parent_id: string
          printed_revision: string
          recorded_at?: string
          result: string
          source: string
          workbook_id: string
        }
        Update: {
          based_on_version?: number
          baseline_id?: string
          child_id?: string
          engine?: string
          evidence_reference?: string
          help?: string
          id?: string
          item_id?: string
          item_row_id?: string
          page_id?: string
          parent_id?: string
          printed_revision?: string
          recorded_at?: string
          result?: string
          source?: string
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_second_tries_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "workbook_book1_baselines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_second_tries_child_id_parent_id_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbook_second_tries_item_row_id_fkey"
            columns: ["item_row_id"]
            isOneToOne: false
            referencedRelation: "scan_marking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workbook_second_tries_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      workbook_workers: {
        Row: {
          build: string | null
          id: string
          note: string | null
          primary_ai: string
          run_id: string | null
          seen_at: string
          started_at: string
        }
        Insert: {
          build?: string | null
          id: string
          note?: string | null
          primary_ai?: string
          run_id?: string | null
          seen_at?: string
          started_at?: string
        }
        Update: {
          build?: string | null
          id?: string
          note?: string | null
          primary_ai?: string
          run_id?: string | null
          seen_at?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbook_workers_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workbook_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workbooks: {
        Row: {
          approved_at: string | null
          child_id: string
          created_at: string
          id: string
          levels: number[]
          number: number
          parent_id: string
          pdf_path: string | null
          pdf_sha256: string | null
          print_manifest: Json | null
          printed_at: string | null
          printed_revision: string | null
          profile_build: string | null
          shipped_at: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          child_id: string
          created_at?: string
          id: string
          levels: number[]
          number: number
          parent_id: string
          pdf_path?: string | null
          pdf_sha256?: string | null
          print_manifest?: Json | null
          printed_at?: string | null
          printed_revision?: string | null
          profile_build?: string | null
          shipped_at?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          child_id?: string
          created_at?: string
          id?: string
          levels?: number[]
          number?: number
          parent_id?: string
          pdf_path?: string | null
          pdf_sha256?: string | null
          print_manifest?: Json | null
          printed_at?: string | null
          printed_revision?: string | null
          profile_build?: string | null
          shipped_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workbooks_child_fkey"
            columns: ["child_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id", "parent_id"]
          },
          {
            foreignKeyName: "workbooks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _admit_workbook_scan_receipt: {
        Args: { p_photo: string }
        Returns: string
      }
      _claim_workbook_scan_trigger: {
        Args: { p_at: string; p_book: string }
        Returns: Json
      }
      _lock_workbook_scan_book: {
        Args: { p_book: string }
        Returns: {
          approved_at: string | null
          child_id: string
          created_at: string
          id: string
          levels: number[]
          number: number
          parent_id: string
          pdf_path: string | null
          pdf_sha256: string | null
          print_manifest: Json | null
          printed_at: string | null
          printed_revision: string | null
          profile_build: string | null
          shipped_at: string | null
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "workbooks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _lock_workbook_scan_reminder_parent: {
        Args: { p_parent: string }
        Returns: boolean
      }
      _maya_family_window: {
        Args: { p_at: string; p_kind: string; p_parent: string }
        Returns: {
          period: string
          period_start: string
        }[]
      }
      _maya_minutes_used:
        | {
            Args: {
              p_child: string
              p_except: string
              p_kind: string
              p_parent: string
              p_period: string
            }
            Returns: number
          }
        | {
            Args: {
              p_child: string
              p_except: string
              p_kind: string
              p_parent: string
              p_period_start: string
            }
            Returns: number
          }
      _maya_normalize_zone: { Args: { p_zone: string }; Returns: string }
      _maya_period_window: {
        Args: { p_at: string; p_kind: string; p_zone: string }
        Returns: {
          period: string
          period_start: string
        }[]
      }
      _maya_spend_counted: {
        Args: { p_child: string; p_month: string; p_week: string }
        Returns: {
          month_micros: number
          week_micros: number
        }[]
      }
      _maya_zone_at: { Args: { p_at: string; p_zone: string }; Returns: string }
      _next_book_consumed_ok: { Args: { x: Json }; Returns: boolean }
      _next_book_count: { Args: { v: Json }; Returns: boolean }
      _next_book_draft_locked: {
        Args: { p_child: string; p_draft: string; p_parent: string }
        Returns: string
      }
      _next_book_held_ok: { Args: { x: Json }; Returns: boolean }
      _next_book_source_problem: {
        Args: { p_book: string; p_revision: string }
        Returns: string
      }
      _workbook_scan_day7: { Args: { p_book: string }; Returns: string[] }
      _workbook_scan_family_clock_context: {
        Args: { p_parent: string }
        Returns: Json
      }
      _workbook_scan_inactivity_identity: {
        Args: { p_at: string; p_book: string }
        Returns: Json
      }
      _workbook_scan_inactivity_recovery: {
        Args: { p_at: string; p_book: string; p_kind: string }
        Returns: boolean
      }
      _workbook_scan_reminder_due_set: {
        Args: { p_at: string; p_message?: string; p_parent: string }
        Returns: Json
      }
      _workbook_scan_reminder_program: {
        Args: { p_at: string; p_child: string; p_parent: string }
        Returns: boolean
      }
      abandon_family_payment_operation: {
        Args: {
          p: string
          resource_id: string
          resource_kind: string
          token: string
        }
        Returns: boolean
      }
      acknowledge_scan_photo_notice: {
        Args: { p_parent: string }
        Returns: boolean
      }
      admin_assessments: {
        Args: never
        Returns: {
          break_ended_at: string | null
          break_ms: number | null
          break_skipped: boolean | null
          break_started_at: string | null
          child_id: string
          completed_at: string | null
          created_at: string
          device: Json | null
          grade: number
          help: string | null
          id: string
          last_answer_at: string | null
          parent_id: string
          placement: Json | null
          province: string
          resume_until: string
          route: string | null
          seed: number
          stage3_route: string | null
          started_at: string
          status: string
          test: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "assessments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_card_setups: {
        Args: never
        Returns: {
          card_saved_at: string | null
          child_id: string
          created_at: string
          id: string
          parent_id: string
          plan: string
          price: number
          report_id: string | null
          stripe_customer_id: string | null
          updated_at: string
          workbook_email_checked_at: string | null
          workbook_welcome_enabled: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "card_setups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_children: {
        Args: never
        Returns: {
          created_at: string
          first_name: string
          former_names: string[]
          grade: number
          id: string
          interests: string[] | null
          learning_goal: string | null
          learning_note: string | null
          learning_styles: string[] | null
          learning_updated_at: string | null
          math_feeling: string | null
          parent_id: string
          province: string
          weekly_time: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "children"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_open_plan_cancels: {
        Args: { p_parent: string }
        Returns: {
          child_name: string
          created_at: string
          id: string
        }[]
      }
      admin_parents: {
        Args: never
        Returns: {
          created_at: string
          deletion_requested_at: string | null
          email: string
          id: string
          name: string
          postal: string | null
          source: Json
          time_zone: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "parents"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_reconcile_workbook_scan_progress: {
        Args: { p_books: string[] }
        Returns: Json
      }
      admin_reports: {
        Args: never
        Returns: {
          alert_error: string | null
          alerted_at: string | null
          assessment_id: string
          child_id: string
          created_at: string
          email_clicks: number
          email_error: string | null
          email_first_clicked_at: string | null
          email_id: string | null
          email_last_clicked_at: string | null
          emailed_at: string | null
          id: string
          minutes: number
          model: Json
          parent_id: string
          questions: number
          unsubscribe_hash: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_scan_team_queue: {
        Args: { p_limit?: number }
        Returns: {
          book: number
          child_id: string
          child_name: string
          issue: string
          item_id: string
          page_number: number
          parent_id: string
          photo_id: string
          question_number: number
          read_text: string
          test_family: boolean
          total: number
          waiting_since: string
          workbook_id: string
        }[]
      }
      admin_scan_team_queue_v2: {
        Args: { p_limit?: number; p_with_tests?: boolean }
        Returns: {
          book: number
          child_id: string
          child_name: string
          issue: string
          item_id: string
          page_number: number
          parent_id: string
          photo_id: string
          question_number: number
          read_text: string
          real_total: number
          test_family: boolean
          total: number
          waiting_since: string
          workbook_id: string
        }[]
      }
      admin_set_maya_chat_family: {
        Args: { p_change: string; p_enabled: boolean; p_parent: string }
        Returns: string
      }
      admin_set_scan_mark: {
        Args: { p_item: string; p_result: string; p_version: number }
        Returns: Json
      }
      admin_set_test_account: {
        Args: { p_parent: string; p_test: boolean }
        Returns: undefined
      }
      admin_team_ids: { Args: never; Returns: string[] }
      admin_team_names: {
        Args: never
        Returns: {
          name: string
          user_id: string
        }[]
      }
      admin_template_stats: {
        Args: {
          curriculum?: string
          school_grade?: number
          with_tests?: boolean
        }
        Returns: {
          correct: number
          median_ms: number
          shown: number
          template_id: string
          wrong: Json
        }[]
      }
      admin_template_stats_v2: {
        Args: {
          curriculum?: string
          school_grade?: number
          with_tests?: boolean
        }
        Returns: {
          answered: number
          correct: number
          median_ms: number
          shown: number
          template_id: string
          wrong: Json
        }[]
      }
      admin_test_progress: {
        Args: { ids?: string[] }
        Returns: {
          answered: number
          block_lengths: number[]
          blocks_complete: boolean
          blocks_locked: number
          break_ended_at: string
          break_started_at: string
          completed_at: string
          down: number
          facts_answered: number
          facts_started_at: string
          id: string
          last_answer_at: string
          last_shown_at: string
          last_shown_position: number
          next_prompt: string
          resume_until: string
          route: string
          stage1: number
          stage3_down: number
          stage3_route: string
          stage3_up: number
          started_at: string
          status: string
          stay: number
          up: number
        }[]
      }
      admin_test_progress_for: {
        Args: { ids: string[] }
        Returns: {
          answered: number
          block_lengths: number[]
          blocks_complete: boolean
          blocks_locked: number
          break_ended_at: string
          break_started_at: string
          completed_at: string
          down: number
          facts_answered: number
          facts_drawn: number
          facts_started_at: string
          facts_tried: number
          id: string
          last_answer_at: string
          last_shown_at: string
          last_shown_position: number
          next_prompt: string
          resume_until: string
          route: string
          stage1: number
          stage3_down: number
          stage3_route: string
          stage3_up: number
          started_at: string
          status: string
          stay: number
          up: number
        }[]
      }
      admin_waitlist_joins: {
        Args: never
        Returns: {
          child_id: string
          created_at: string
          id: string
          parent_id: string
          province: string
          report_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "waitlist_joins"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admit_family_plan_start: {
        Args: {
          p_card: string
          p_generation: number
          p_key: string
          p_monthly_cents: number
          p_payment_method: string
          p_purpose: string
          p_revision?: string
        }
        Returns: Json
      }
      admit_next_book_run: {
        Args: {
          p_by: string
          p_email: string
          p_max_attempts: number
          p_snapshot: string
          p_stale_seconds: number
          p_test_only?: boolean
        }
        Returns: Json
      }
      admit_plan_cancel: {
        Args: { p_card: string; p_parent: string }
        Returns: string
      }
      admit_plan_pause: {
        Args: {
          p_card: string
          p_parent: string
          p_quote: Json
          p_token: string
        }
        Returns: Json
      }
      admit_plan_start: {
        Args: {
          p_card: string
          p_generation: number
          p_key: string
          p_payment_method: string
        }
        Returns: Json
      }
      admit_plan_start_terms: {
        Args: {
          p_card: string
          p_generation: number
          p_key: string
          p_monthly_cents: number
          p_payment_method: string
          p_purpose: string
          p_revision?: string
        }
        Returns: Json
      }
      admit_scan_photo: {
        Args: {
          p_bytes: number
          p_child: string
          p_id: string
          p_parent: string
        }
        Returns: string
      }
      admit_workbook_scan_reminder: {
        Args: { p_attempt: string; p_message: string }
        Returns: Json
      }
      advance_family_deletion_cursor: {
        Args: { p: string }
        Returns: undefined
      }
      append_maya_call_connection: {
        Args: { p_call: string; p_kind: string; p_revision: number }
        Returns: string
      }
      append_maya_call_ink: {
        Args: {
          p_after_end_ms: number
          p_child: string
          p_events: Json
          p_from: number
          p_gap_ms: number
          p_id: string
          p_parent: string
        }
        Returns: Json
      }
      apply_workbook_print_contract: {
        Args: { p_workbook: Json }
        Returns: undefined
      }
      approve_workbook_draft: {
        Args: {
          p_by: string
          p_by_email: string
          p_draft: string
          p_revision: number
          p_schema_version: number
          p_workbook: Json
        }
        Returns: Json
      }
      assert_child_deletion_lease: {
        Args: { c: string; p: string; token: string }
        Returns: undefined
      }
      assert_child_email_scopes: { Args: { p: string }; Returns: undefined }
      assert_family_writable: { Args: { p: string }; Returns: undefined }
      assert_plan_workbook_allowed: {
        Args: { p_child: string; p_number: number; p_shipping: boolean }
        Returns: undefined
      }
      beat_workbook_worker: {
        Args: {
          p_build: string
          p_id: string
          p_note: string
          p_primary_ai: string
          p_run: string
          p_started: boolean
        }
        Returns: undefined
      }
      begin_booking_signup: { Args: { payload: Json }; Returns: boolean }
      begin_family_card_operation: {
        Args: { p: string; token: string }
        Returns: undefined
      }
      begin_family_delete_code:
        | {
            Args: {
              p_day_seconds: number
              p_hash: string
              p_now: string
              p_parent: string
              p_per_day: number
              p_per_window: number
              p_ttl_seconds: number
              p_window_seconds: number
            }
            Returns: {
              out_retry_at: string
              out_status: string
            }[]
          }
        | {
            Args: {
              p_day_seconds: number
              p_hash: string
              p_parent: string
              p_per_day: number
              p_per_window: number
              p_ttl_seconds: number
              p_window_seconds: number
            }
            Returns: {
              out_retry_at: string
              out_status: string
            }[]
          }
      begin_family_delete_hold: {
        Args: { hold: string; p: string }
        Returns: string
      }
      begin_family_payment_operation: {
        Args: {
          customer: string
          p: string
          resource_id: string
          resource_kind: string
          token: string
        }
        Returns: boolean
      }
      begin_plan_start: {
        Args: { p_card: string; p_key: string; p_payment_method: string }
        Returns: Json
      }
      begin_scan_calibration: {
        Args: {
          p_id: string
          p_lease_seconds?: number
          p_parent: string
          p_token: string
        }
        Returns: Json
      }
      card_check_rows: {
        Args: {
          p_card?: string
          p_changed_after?: string
          p_customer?: string
          p_limit?: number
        }
        Returns: {
          card_id: string
          customer: string
          needs_repair: boolean
          payment_method_id: string
          session_id: string
          start_alert: string
          start_at: string
          start_card: string
          start_email: string
          start_finished_at: string
          start_first_charge: string
          start_generation: number
          start_key: string
          start_state: string
          start_subscription: string
        }[]
      }
      card_recovery_rows: {
        Args: {
          p_card?: string
          p_changed_after?: string
          p_customer?: string
          p_limit?: number
        }
        Returns: {
          card_id: string
          customer: string
          deletion_queued: boolean
          needs_repair: boolean
          payment_method_id: string
          session_id: string
          start_alert: string
          start_at: string
          start_card: string
          start_email: string
          start_finished_at: string
          start_first_charge: string
          start_generation: number
          start_key: string
          start_state: string
          start_subscription: string
        }[]
      }
      card_update_rows: {
        Args: {
          p_card?: string
          p_changed_after?: string
          p_customer?: string
          p_limit?: number
        }
        Returns: {
          card_id: string
          customer: string
          needs_repair: boolean
          payment_method_id: string
          pending_plan_at: string
          pending_plan_card: string
          pending_plan_key: string
          session_id: string
        }[]
      }
      change_answer: {
        Args: {
          p_answer_changes: Json
          p_answered_at: string
          p_assessment: string
          p_away_count: number
          p_away_ms: number
          p_correct: boolean
          p_misconception: string
          p_position: number
          p_question_id: string
          p_read_aloud_at_ms: number[]
          p_read_aloud_count: number
          p_response: string
          p_strokes_path: string
          p_time_ms: number
          p_unanswered_from: number
          p_work_changed: boolean
          p_work_path: string
          p_work_text: string
        }
        Returns: Json
      }
      change_answer_keep_drawing: {
        Args: {
          p_answer_changes: Json
          p_answered_at: string
          p_assessment: string
          p_away_count: number
          p_away_ms: number
          p_correct: boolean
          p_misconception: string
          p_position: number
          p_question_id: string
          p_read_aloud_at_ms: number[]
          p_read_aloud_count: number
          p_response: string
          p_time_ms: number
          p_unanswered_from: number
          p_work_text: string
        }
        Returns: Json
      }
      change_scan_photo: {
        Args: { p_action: string; p_id: string; p_parent: string }
        Returns: string
      }
      check_child_deletion: { Args: { c: string; p: string }; Returns: string }
      check_family_payment_lease: {
        Args: { p: string; token: string }
        Returns: undefined
      }
      check_parent_family_deletion: { Args: { p: string }; Returns: string }
      checkpoint_workbook_edit: {
        Args: { p_id: string; p_lease: string; p_page: number; p_result: Json }
        Returns: boolean
      }
      child_copy_sources: {
        Args: { c: string; p: string; token: string }
        Returns: Json
      }
      child_delete_roots: {
        Args: { c: string; p: string }
        Returns: {
          bucket: string
          prefix: string
        }[]
      }
      child_delete_row_child: { Args: { r: Json; t: string }; Returns: string }
      claim_card_update: {
        Args: {
          p_card: string
          p_parent: string
          p_session: string
          p_session_created_at: string
        }
        Returns: string
      }
      claim_child_deletion: {
        Args: { c: string; p: string; token: string }
        Returns: boolean
      }
      claim_family_delete_attempt: {
        Args: {
          p_lock_seconds: number
          p_max: number
          p_now: string
          p_parent: string
        }
        Returns: {
          out_attempts_left: number
          out_locked_until: string
          out_status: string
        }[]
      }
      claim_family_deletion: {
        Args: { p: string; token: string }
        Returns: Json
      }
      claim_family_finish: {
        Args: { p_claim: string; p_user: string }
        Returns: string
      }
      claim_family_retention: {
        Args: { p: string; subscription_ended_at: string; token: string }
        Returns: Json
      }
      claim_maya_chat_message: {
        Args: {
          p_call: string
          p_child: string
          p_end: string
          p_fingerprint: string
          p_id: string
          p_parent: string
          p_revision: number
          p_start: string
        }
        Returns: Json
      }
      claim_maya_spend_alert: { Args: { p_month: string }; Returns: boolean }
      claim_maya_weekly: {
        Args: {
          p_attempts: number
          p_calls: string[]
          p_hash: string
          p_parent: string
          p_retry: string
          p_week: string
        }
        Returns: string
      }
      claim_monthly_summary_render: {
        Args: { p_max: number; p_parent: string; p_window_seconds: number }
        Returns: boolean
      }
      claim_next_book_snapshot: {
        Args: {
          p_actor: string
          p_book: string
          p_email: string
          p_trigger: string
        }
        Returns: Json
      }
      claim_pin_attempt: {
        Args: {
          p_lock_seconds: number
          p_max: number
          p_now: string
          p_parent: string
        }
        Returns: {
          out_attempts_left: number
          out_hash: string
          out_locked_until: string
          out_status: string
        }[]
      }
      claim_pin_reset_attempt: {
        Args: {
          p_lock_seconds: number
          p_max: number
          p_now: string
          p_parent: string
        }
        Returns: {
          out_attempts_left: number
          out_locked_until: string
          out_status: string
        }[]
      }
      claim_plan_cancel_alert: { Args: { p_id: string }; Returns: boolean }
      claim_plan_start_alert: {
        Args: { p_card: string; p_generation: number }
        Returns: boolean
      }
      claim_plan_start_email: {
        Args: {
          p_card: string
          p_generation: number
          p_message: Json
          p_token: string
        }
        Returns: boolean
      }
      claim_report_give_up: {
        Args: {
          p_assessment: string
          p_email_age_s: number
          p_max_attempts: number
          p_min_age_s: number
        }
        Returns: string
      }
      claim_report_retry: {
        Args: {
          p_assessment: string
          p_delays_s: number[]
          p_email_age_s: number
          p_max_attempts: number
          p_min_age_s: number
        }
        Returns: {
          out_attempt: number
          out_email: boolean
        }[]
      }
      claim_scan_link_email: {
        Args: {
          p_child: string
          p_max: number
          p_parent: string
          p_window_seconds: number
        }
        Returns: string
      }
      claim_workbook_edit: {
        Args: { p_id: string; p_lease: string; p_runner: string }
        Returns: boolean
      }
      claim_workbook_email: {
        Args: {
          p_card_setup_id: string
          p_delivery: Json
          p_kind: string
          p_message: Json
          p_token: string
          p_workbook_number: number
        }
        Returns: {
          claim_token: string
          id: string
        }[]
      }
      claim_workbook_layout_edit: {
        Args: { p_id: string; p_lease: string }
        Returns: boolean
      }
      claim_workbook_run:
        | { Args: { p_lease: string; p_run: string }; Returns: boolean }
        | {
            Args: { p_lease: string; p_run: string; p_runner: string }
            Returns: boolean
          }
      claim_workbook_scan_reminder: {
        Args: {
          p_episodes: string[]
          p_parent: string
          p_unsubscribe_hash: string
        }
        Returns: Json
      }
      clear_family_delete_attempts: {
        Args: { p_parent: string }
        Returns: undefined
      }
      close_plan_cancel: {
        Args: { p_id: string; p_parent: string; p_state: string }
        Returns: boolean
      }
      complete_child_deletion: {
        Args: { c: string; p: string; token: string }
        Returns: boolean
      }
      complete_family_deletion: {
        Args: { p: string; token: string }
        Returns: boolean
      }
      complete_test: {
        Args: {
          p_answers: Json
          p_assessment: string
          p_completed_at: string
          p_help: string
          p_placement: Json
        }
        Returns: string
      }
      complete_workbook_edit_call: {
        Args: {
          p_attempt: number
          p_hash: string
          p_id: string
          p_kind: string
          p_lease: string
          p_page: number
          p_question: string
          p_result: Json
        }
        Returns: boolean
      }
      confirm_child_copies: {
        Args: { c: string; p: string; token: string }
        Returns: boolean
      }
      confirm_family_copies: {
        Args: { p: string; token: string }
        Returns: boolean
      }
      confirm_workbook_delivery: {
        Args: {
          p_child: string
          p_delivered: string
          p_local: string
          p_number: number
          p_override: boolean
          p_workbook: string
          p_zone: string
        }
        Returns: Json
      }
      consume_family_delete_code: {
        Args: { p_hash: string; p_parent: string }
        Returns: boolean
      }
      correct_workbook_delivery: {
        Args: {
          p_child: string
          p_delivered: string
          p_expected_audit: number
          p_local: string
          p_number: number
          p_override: boolean
          p_reason: string
          p_request: string
          p_workbook: string
          p_zone: string
        }
        Returns: Json
      }
      count_workbook_run_attempts: {
        Args: {
          p_lease: string
          p_max: number
          p_page: number
          p_run: string
          p_slots: string[]
        }
        Returns: Json
      }
      create_family: {
        Args: {
          p_child_grade: number
          p_child_name: string
          p_child_province: string
          p_email: string
          p_name: string
          p_parent: string
          p_postal: string
          p_source: Json
        }
        Returns: Json
      }
      decide_family_deletion: {
        Args: { keep_family: boolean; p: string; token: string }
        Returns: boolean
      }
      defer_scan_marking_evaluation: {
        Args: {
          p_attempt: string
          p_id: string
          p_received_at: number
          p_response: Json
          p_run: string
        }
        Returns: boolean
      }
      due_plan_cancel_alerts: {
        Args: { p_before: string; p_limit?: number }
        Returns: {
          created_at: string
          id: string
          parent_id: string
        }[]
      }
      due_plan_reads: {
        Args: { p_limit?: number }
        Returns: {
          child_id: string
          customer: string
          event_at: string
          kind: string
          parent_id: string
        }[]
      }
      due_plan_start_reads: {
        Args: { p_limit?: number }
        Returns: {
          child_id: string
          customer: string
          event_at: string
          kind: string
          parent_id: string
        }[]
      }
      email_copy_child_scope: {
        Args: { l: Database["public"]["Tables"]["email_log"]["Row"] }
        Returns: string[]
      }
      end_family_card_operation: { Args: { token: string }; Returns: undefined }
      end_family_delete_hold: {
        Args: { hold: string; p: string }
        Returns: undefined
      }
      end_plan_start: {
        Args: { p_card: string; p_key: string }
        Returns: boolean
      }
      exclude_workbook_run_ai: {
        Args: { p_note: string; p_provider: string; p_run: string }
        Returns: boolean
      }
      expire_scan_photos: { Args: never; Returns: undefined }
      fail_workbook_run: {
        Args: { p_error: string; p_lease: string; p_run: string }
        Returns: boolean
      }
      family_copy_sources: { Args: { p: string }; Returns: Json }
      family_deletion_candidates: {
        Args: { after_id: string; page_size?: number }
        Returns: {
          parent_id: string
        }[]
      }
      family_deletion_cursor: { Args: never; Returns: string }
      family_deletion_start_customers: {
        Args: { p: string }
        Returns: {
          customer: string
        }[]
      }
      family_last_activity: { Args: { p: string }; Returns: string }
      family_plan_offer: {
        Args: { p_agreed_cents: number; p_child: string; p_parent: string }
        Returns: Json
      }
      family_plan_price: {
        Args: { p_agreed_cents: number; p_card: string; p_parent: string }
        Returns: number
      }
      family_plan_start_answer: {
        Args: {
          p_admitted: boolean
          p_row: Database["public"]["Tables"]["plan_starts"]["Row"]
        }
        Returns: Json
      }
      family_plan_start_open: { Args: { p: string }; Returns: boolean }
      family_plan_start_terms: {
        Args: { p_card: string; p_generation: number }
        Returns: Json
      }
      family_retention_candidates: {
        Args: { after_id: string; page_size?: number }
        Returns: {
          cards: Json
          last_activity: string
          parent_id: string
          queued: boolean
        }[]
      }
      family_retention_cards: { Args: { p: string }; Returns: Json }
      family_retention_due: { Args: { p: string }; Returns: boolean }
      finish_booking_signup: {
        Args: { booking_ref: string; customer: string }
        Returns: boolean
      }
      finish_card_lock: {
        Args: {
          p_card: string
          p_session: string
          p_token: string
          p_wrote: boolean
        }
        Returns: Json
      }
      finish_card_update: {
        Args: { p_card: string; p_parent: string; p_session: string }
        Returns: string
      }
      finish_family_payment_operation: {
        Args: {
          p: string
          resource_id: string
          resource_kind: string
          resource_state: string
          token: string
        }
        Returns: undefined
      }
      finish_family_plan_start: {
        Args: {
          p_card: string
          p_email: boolean
          p_first_charge: string
          p_generation: number
          p_state: string
          p_subscription: string
        }
        Returns: boolean
      }
      finish_plan_control: {
        Args: { p_id: string; p_state: string }
        Returns: undefined
      }
      finish_plan_start: {
        Args: {
          p_card: string
          p_email: boolean
          p_first_charge: string
          p_generation: number
          p_state: string
          p_subscription: string
        }
        Returns: boolean
      }
      finish_scan_calibration: {
        Args: {
          p_bytes: number
          p_id: string
          p_parent: string
          p_result: Json
          p_state: string
          p_token: string
        }
        Returns: string
      }
      finish_scan_photo: {
        Args: { p_bytes: number; p_id: string; p_parent: string }
        Returns: string
      }
      finish_workbook_edit: {
        Args: {
          p_content: Json
          p_error: string
          p_id: string
          p_lease: string
          p_problems: Json
          p_rendering: Json
        }
        Returns: Json
      }
      finish_workbook_layout_edit: {
        Args: {
          p_error: string
          p_id: string
          p_lease: string
          p_rendering: Json
          p_results: Json
        }
        Returns: Json
      }
      finish_workbook_question_edit_checked: {
        Args: {
          p_content: Json
          p_error: string
          p_id: string
          p_lease: string
          p_problems: Json
          p_rendering: Json
        }
        Returns: Json
      }
      finish_workbook_run: {
        Args: {
          p_draft: string
          p_lease: string
          p_render_problems: Json
          p_rendering: Json
          p_run: string
        }
        Returns: boolean
      }
      finish_workbook_scan_reminder: {
        Args: {
          p_attempt: string
          p_email_id?: string
          p_message: string
          p_outcome: string
        }
        Returns: Json
      }
      frame_workbook_edit: {
        Args: { p_frame: Json; p_id: string; p_lease: string }
        Returns: Json
      }
      grant_maya_minutes:
        | {
            Args: {
              p_call: string
              p_call_seconds: number
              p_child: string
              p_kind: string
              p_min_seconds: number
              p_parent: string
              p_period: string
              p_period_seconds: number
            }
            Returns: {
              granted: number
              used_before: number
            }[]
          }
        | {
            Args: {
              p_call: string
              p_call_seconds: number
              p_child: string
              p_kind: string
              p_min_seconds: number
              p_parent: string
              p_period: string
              p_period_seconds: number
              p_period_start: string
            }
            Returns: {
              granted: number
              used_before: number
            }[]
          }
      hold_next_book_snapshot: {
        Args: { p_book: string; p_delivery_audit: number }
        Returns: Json
      }
      identify_scan_photo: {
        Args: {
          p_height: number
          p_id: string
          p_parent: string
          p_token: string
          p_width: number
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      issue_sign_in_link: {
        Args: {
          p_child: string
          p_max: number
          p_parent: string
          p_token_hash: string
          p_ttl_seconds: number
        }
        Returns: string
      }
      link_booking_family: {
        Args: { pid: string; sid: number }
        Returns: undefined
      }
      list_workbook_scan_clock_requests: {
        Args: { p_limit: number }
        Returns: Json
      }
      list_workbook_scan_recovery_books: {
        Args: { p_after?: string; p_kind: string; p_limit: number }
        Returns: Json
      }
      lock_assessment_block: {
        Args: {
          p_adaptive: Json
          p_answers: Json
          p_assessment: string
          p_expected: number
          p_resume_until: string
        }
        Returns: string
      }
      lock_booking_email: { Args: { mail: string }; Returns: undefined }
      lock_maya_family: { Args: { p: string }; Returns: undefined }
      lock_maya_family_list: { Args: { p: string }; Returns: undefined }
      lock_stage1: {
        Args: { p_answers: Json; p_assessment: string; p_route: string }
        Returns: string
      }
      lock_stage2: {
        Args: {
          p_answers: Json
          p_assessment: string
          p_resume_until: string
          p_stage3_route: string
        }
        Returns: string
      }
      mark_workbook: {
        Args: {
          p_by: string
          p_by_email: string
          p_to: string
          p_workbook: string
        }
        Returns: Json
      }
      maya_minutes_used:
        | {
            Args: {
              p_child: string
              p_kind: string
              p_parent: string
              p_period: string
            }
            Returns: number
          }
        | {
            Args: {
              p_child: string
              p_kind: string
              p_parent: string
              p_period_start: string
            }
            Returns: number
          }
      maya_spend_used: {
        Args: { p_child: string; p_month: string; p_week: string }
        Returns: {
          month_micros: number
          week_micros: number
        }[]
      }
      my_family_deletion_state: { Args: never; Returns: string }
      note_card_checked: { Args: { p_card: string }; Returns: undefined }
      note_plan_cancel_alert: {
        Args: { p_id: string; p_state: string }
        Returns: undefined
      }
      note_plan_read_tried: { Args: { p_child: string }; Returns: undefined }
      note_plan_start_alert: {
        Args: {
          p_card: string
          p_email_id: string
          p_error: string
          p_generation: number
          p_state: string
        }
        Returns: boolean
      }
      note_plan_start_email: {
        Args: { p_card: string; p_generation: number; p_state: string }
        Returns: boolean
      }
      note_plan_start_email_send: {
        Args: {
          p_card: string
          p_email_id: string
          p_error: string
          p_generation: number
          p_status: string
          p_token: string
        }
        Returns: boolean
      }
      note_plan_start_read_tried: {
        Args: { p_child: string }
        Returns: undefined
      }
      parent_explanation_command: {
        Args: {
          p_action: string
          p_data?: Json
          p_parent: string
          p_photo: string
          p_token: string
        }
        Returns: Json
      }
      parent_maya_note_sessions: {
        Args: { p_calls: string[] }
        Returns: {
          call_id: string
          channel: string
          started_at: string
        }[]
      }
      parent_reads_workbook: { Args: { p_workbook: string }; Returns: boolean }
      parent_reads_workbook_folder: {
        Args: { p_folder: string }
        Returns: boolean
      }
      pending_family_payment_operations: {
        Args: { after_id: string; p: string; page_size?: number; token: string }
        Returns: {
          customer_id: string
          kind: string
          object_id: string
        }[]
      }
      ping: { Args: never; Returns: number }
      plan_control_context: {
        Args: { p_card: string; p_parent: string }
        Returns: Json
      }
      plan_control_operation: {
        Args: { p_card: string; p_parent: string; p_token: string }
        Returns: Json
      }
      plan_control_owner: {
        Args: { p_card: string; p_parent: string }
        Returns: string
      }
      plan_mailing_obligations: {
        Args: { p_child: string; p_number: number }
        Returns: {
          target: number
          weeks: number
        }[]
      }
      plan_mailing_weeks: {
        Args: { p_child: string; p_number: number; p_parent: string }
        Returns: number
      }
      plan_start_answer: {
        Args: {
          p_admitted: boolean
          p_row: Database["public"]["Tables"]["plan_starts"]["Row"]
        }
        Returns: Json
      }
      plan_start_terms: {
        Args: { p_card: string; p_generation: number }
        Returns: Json
      }
      propose_workbook_scan_inactivity: {
        Args: {
          p_activity: string
          p_anchor: string
          p_book: string
          p_clock_version: string
          p_context: Json
          p_delivery_audit: number
          p_due: string
        }
        Returns: Json
      }
      queue_workbook_edit: {
        Args: {
          p_action: string
          p_by: string
          p_draft: string
          p_email: string
          p_item: Json
          p_note: string
          p_page: number
          p_question: number
          p_revision: number
          p_runner: string
        }
        Returns: Json
      }
      queue_workbook_layout_edit: {
        Args: {
          p_by: string
          p_draft: string
          p_email: string
          p_plan: Json
          p_revision: number
        }
        Returns: Json
      }
      read_family_delete_code: {
        Args: { p_parent: string }
        Returns: {
          out_expires_at: string
          out_hash: string
        }[]
      }
      read_family_payment_progress: {
        Args: { customer: string; p: string; token: string }
        Returns: Json
      }
      read_workbook_scan_inactivity_context: {
        Args: { p_book: string }
        Returns: Json
      }
      read_workbook_scan_reminder_due: {
        Args: { p_parent: string }
        Returns: Json
      }
      reconcile_family_plan_reservations: {
        Args: { p_parent: string }
        Returns: undefined
      }
      reconcile_scan_cleanup: { Args: { p_id: string }; Returns: boolean }
      reconcile_workbook_scan_progress: {
        Args: { p_books: string[] }
        Returns: Json
      }
      record_card_update: {
        Args: {
          p_card: string
          p_parent: string
          p_payment_method: string
          p_session: string
          p_session_created_at: string
        }
        Returns: Json
      }
      record_maya_wordings: {
        Args: { p_child: string; p_heard: Json; p_max: number }
        Returns: number
      }
      record_reminder_click: {
        Args: {
          p_assessment: string
          p_child: string
          p_kind: string
          p_parent: string
        }
        Returns: undefined
      }
      record_report_email_click: {
        Args: { p_parent: string; p_report: string }
        Returns: undefined
      }
      record_skill_state_changes: {
        Args: {
          p_build: string
          p_child: string
          p_parent: string
          p_states: Json
        }
        Returns: number
      }
      record_workbook_scan_delivery_calendar: {
        Args: {
          p_backstop: string
          p_book: string
          p_clock_version: string
          p_delivered: string
          p_delivery_audit: number
          p_override: boolean
          p_zone: string
        }
        Returns: Json
      }
      record_workbook_second_try: {
        Args: {
          p_based_on_version: number
          p_baseline: string
          p_evidence_reference: string
          p_help: string
          p_id: string
          p_item_row: string
          p_result: string
        }
        Returns: Json
      }
      recover_maya_chat_message: {
        Args: { p_child: string; p_parent: string }
        Returns: Json
      }
      recover_scan_marking: { Args: { p_limit?: number }; Returns: Json }
      recover_scan_marking_oldest: { Args: { p_limit?: number }; Returns: Json }
      recover_scan_photo: {
        Args: { p_id: string; p_parent: string }
        Returns: string
      }
      redact_child_email_logs: {
        Args: { c: string; p: string }
        Returns: undefined
      }
      refresh_scan_marking_evaluation_price: {
        Args: {
          p_details: string
          p_endpoint: string
          p_evidence: string
          p_maximum: number
          p_model: string
          p_previous_evidence: string
        }
        Returns: Json
      }
      release_card_lock: {
        Args: { p_card: string; p_token: string }
        Returns: boolean
      }
      release_child_deletion: {
        Args: { c: string; p: string; token: string }
        Returns: undefined
      }
      release_family_deletion: {
        Args: { p: string; token: string }
        Returns: undefined
      }
      release_family_finish: {
        Args: { p_claim: string; p_user: string }
        Returns: undefined
      }
      release_plan_start_email: {
        Args: { p_card: string; p_generation: number; p_token: string }
        Returns: boolean
      }
      release_scan_photo: {
        Args: { p_id: string; p_parent: string }
        Returns: string
      }
      release_workbook_edit: {
        Args: { p_id: string; p_lease: string }
        Returns: boolean
      }
      release_workbook_scan_reminder: {
        Args: { p_attempt: string; p_message: string }
        Returns: Json
      }
      rename_child: {
        Args: {
          p_child: string
          p_first_name: string
          p_parent: string
          p_stale_seconds: number
        }
        Returns: string
      }
      renew_family_deletion: {
        Args: { p: string; token: string }
        Returns: boolean
      }
      renew_family_deletion_work: {
        Args: { p: string; token: string }
        Returns: boolean
      }
      renew_workbook_run: {
        Args: { p_lease: string; p_run: string }
        Returns: boolean
      }
      reopen_scan_calibration: {
        Args: {
          p_id: string
          p_lease_seconds?: number
          p_parent: string
          p_sheet_check: number
          p_token: string
        }
        Returns: Json
      }
      report_retries_due: {
        Args: { p_email_age_s: number; p_limit: number; p_min_age_s: number }
        Returns: {
          out_assessment: string
          out_attempts: number
        }[]
      }
      report_retry_may_email: {
        Args: {
          p_assessment: string
          p_email_age_s: number
          p_min_age_s: number
        }
        Returns: boolean
      }
      report_retry_need: {
        Args: {
          p_assessment: string
          p_at: string
          p_email_age_s: number
          p_min_age_s: number
        }
        Returns: string
      }
      request_child_deletion_held: {
        Args: { c: string; hold: string; p: string }
        Returns: string
      }
      request_family_deletion: {
        Args: { confirmation: string; p: string }
        Returns: string
      }
      request_parent_family_deletion: {
        Args: { check_only?: boolean; p: string }
        Returns: string
      }
      request_parent_family_deletion_held: {
        Args: { hold: string; p: string }
        Returns: string
      }
      reserve_maya_spend: {
        Args: {
          p_call: string
          p_charge: string
          p_child: string
          p_force: boolean
          p_id: string
          p_micros: number
          p_month: string
          p_parent: string
          p_week: string
          p_week_cap: number
          p_what: string
        }
        Returns: {
          month_micros: number
          ok: boolean
          over: string
        }[]
      }
      reserve_scan_marking_evaluation: {
        Args: {
          p_attempt: string
          p_endpoint: string
          p_evidence: string
          p_maximum: number
          p_model: string
          p_pixels: number
          p_run: string
          p_run_maximum: number
        }
        Returns: Json
      }
      reserve_scan_marking_evaluation_checked: {
        Args: {
          p_attempt: string
          p_endpoint: string
          p_evidence: string
          p_maximum: number
          p_model: string
          p_pixels: number
          p_run: string
          p_run_maximum: number
        }
        Returns: Json
      }
      reserve_scan_marking_physical_evaluation_checked: {
        Args: {
          p_attempt: string
          p_endpoint: string
          p_evidence: string
          p_maximum: number
          p_model: string
          p_pixels: number
          p_run: string
          p_run_maximum: number
        }
        Returns: Json
      }
      reserve_workbook_edit_call: {
        Args: {
          p_hash: string
          p_id: string
          p_kind: string
          p_lease: string
          p_page: number
          p_question: string
        }
        Returns: Json
      }
      resolve_scan_marking_evaluation_full_reservation: {
        Args: {
          p_actor: string
          p_attempt: string
          p_evidence: Json
          p_id: string
          p_run: string
        }
        Returns: boolean
      }
      resume_workbook_run:
        | {
            Args: { p_lease: string; p_run: string; p_stale_seconds: number }
            Returns: boolean
          }
        | {
            Args: {
              p_lease: string
              p_run: string
              p_runner: string
              p_stale_seconds: number
            }
            Returns: boolean
          }
      retake_next_book_snapshot: {
        Args: {
          p_actor: string
          p_draft: string
          p_email: string
          p_snapshot: string
        }
        Returns: Json
      }
      retry_workbook_run: {
        Args: { p_error: string; p_lease: string; p_run: string }
        Returns: boolean
      }
      route_workbook_run: {
        Args: { p_run: string; p_runner: string; p_stale_seconds: number }
        Returns: string
      }
      save_child_plan_state:
        | {
            Args: {
              p_customer: string
              p_ending_free: boolean
              p_ends_at: string
              p_event_at: string
              p_event_id: string
              p_kind: string
              p_monthly_cents: number
              p_next_charge_at: string
              p_read_at: string
            }
            Returns: string
          }
        | {
            Args: {
              p_customer: string
              p_ending_free: boolean
              p_ends_at: string
              p_event_at: string
              p_event_id: string
              p_kind: string
              p_monthly_cents: number
              p_next_charge_at: string
              p_read_order: number
            }
            Returns: string
          }
      save_child_profile_and_skill_changes: {
        Args: {
          p_assessment: string
          p_changes: Json
          p_child: string
          p_expected: string
          p_parent: string
          p_profile: Json
          p_schema_version: number
        }
        Returns: Json
      }
      save_child_profile_and_skill_changes_from_tests: {
        Args: {
          p_assessment: string
          p_changes: Json
          p_child: string
          p_expected: string
          p_parent: string
          p_profile: Json
          p_schema_version: number
          p_tests: string[]
        }
        Returns: Json
      }
      save_family_payment_progress: {
        Args: {
          after_id: string
          customer: string
          finished: boolean
          head_id: string
          p: string
          token: string
        }
        Returns: undefined
      }
      save_family_test_copy: {
        Args: { p: string; test_copy: Json; test_id: string; token: string }
        Returns: boolean
      }
      save_marked_child_profile: {
        Args: {
          p_assessment: string
          p_changes: Json
          p_child: string
          p_expected: string
          p_marking_revision: number
          p_parent: string
          p_profile: Json
          p_schema_version: number
          p_tests: string[]
        }
        Returns: Json
      }
      save_maya_call_ink: {
        Args: {
          p_after_end_ms: number
          p_child: string
          p_gap_ms: number
          p_id: string
          p_ink: Json
          p_parent: string
        }
        Returns: string
      }
      save_next_book_plan: {
        Args: {
          p_consumed: Json
          p_held: Json
          p_plan_hash: string
          p_plan_input: Json
          p_snapshot: string
        }
        Returns: Json
      }
      save_next_book_snapshot: {
        Args: { p_data: Json; p_hash: string; p_id: string }
        Returns: Json
      }
      save_workbook_comment: {
        Args: {
          p_by: string
          p_comment: Json
          p_delete?: boolean
          p_draft: string
          p_email: string
          p_revision: number
        }
        Returns: Json
      }
      save_workbook_rendering: { Args: { p_rendering: Json }; Returns: Json }
      save_workbook_run_ai_calls: {
        Args: { p_calls: Json; p_run: string }
        Returns: number
      }
      save_workbook_run_ai_calls_v2: {
        Args: { p_calls: Json; p_run: string }
        Returns: number
      }
      save_workbook_run_call: {
        Args: {
          p_call: Json
          p_lease: string
          p_page: number
          p_run: string
          p_seq: number
        }
        Returns: boolean
      }
      save_workbook_run_draft: {
        Args: {
          p_draft: Json
          p_failed: number
          p_failed_pages: number
          p_lease: string
          p_levels: number[]
          p_model: string
          p_not_checked: number
          p_number: number
          p_pages: number
          p_profile_build: string
          p_questions: number
          p_run: string
          p_schema_version: number
        }
        Returns: string
      }
      save_workbook_run_frame: {
        Args: { p_frame: Json; p_lease: string; p_run: string }
        Returns: boolean
      }
      save_workbook_run_page: {
        Args: { p_lease: string; p_number: number; p_page: Json; p_run: string }
        Returns: boolean
      }
      save_workbook_run_solves: {
        Args: { p_lease: string; p_logs: Json; p_run: string }
        Returns: boolean
      }
      scan_active_jobs: { Args: { p_parent: string }; Returns: number }
      scan_child_images_live: { Args: { p_child: string }; Returns: boolean }
      scan_marking_automatic_command: {
        Args: {
          p_action: string
          p_data?: Json
          p_parent: string
          p_photo: string
          p_token: string
        }
        Returns: Json
      }
      scan_marking_command: {
        Args: {
          p_action: string
          p_data?: Json
          p_parent: string
          p_photo: string
          p_token: string
        }
        Returns: Json
      }
      scan_marking_evaluation_has_generation: {
        Args: { p: Json }
        Returns: boolean
      }
      scan_marking_evaluation_policy: { Args: { p: Json }; Returns: Json }
      scan_marking_saved_command: {
        Args: {
          p_action: string
          p_data?: Json
          p_parent: string
          p_photo: string
          p_token: string
        }
        Returns: Json
      }
      scan_marking_sheet_current: { Args: { p_result: Json }; Returns: boolean }
      scan_photo_is_active: {
        Args: { p_created: string; p_expires: string; p_state: string }
        Returns: boolean
      }
      scan_session_active: {
        Args: { p_session: string; p_user: string }
        Returns: boolean
      }
      seed_family_plan_history: {
        Args: { p_parent: string }
        Returns: undefined
      }
      send_scan_photos: {
        Args: { p_child: string; p_ids: string[]; p_parent: string }
        Returns: string[]
      }
      send_workbook_comments: {
        Args: {
          p_by: string
          p_draft: string
          p_email: string
          p_revision: number
          p_runner: string
        }
        Returns: Json
      }
      settle_card_update: {
        Args: { p_card: string; p_confirmed: boolean; p_session: string }
        Returns: Json
      }
      settle_maya_spend: {
        Args: { p_cost: number; p_id: string }
        Returns: boolean
      }
      settle_maya_spend_month: {
        Args: { p_cost: number; p_id: string }
        Returns: string
      }
      settle_scan_marking_evaluation: {
        Args: { p_cost: number; p_id: string }
        Returns: boolean
      }
      spend_family_delete_code: {
        Args: { p_hash: string; p_now: string; p_parent: string }
        Returns: boolean
      }
      start_scan_photo: {
        Args: { p_id: string; p_parent: string }
        Returns: string
      }
      start_workbook_run: {
        Args: {
          p_by: string
          p_by_email: string
          p_child: string
          p_max_attempts: number
          p_stale_seconds: number
        }
        Returns: Json
      }
      stop_workbook_run: {
        Args: { p_by: string; p_by_email: string; p_run: string }
        Returns: string
      }
      submit_feedback: {
        Args: {
          p_child: string
          p_parent: string
          p_product: string
          p_request: string
          p_source: string
          p_text: string
        }
        Returns: string
      }
      take_card_lock: {
        Args: {
          p_card: string
          p_parent?: string
          p_payment_method?: string
          p_seconds: number
          p_session?: string
          p_session_created_at?: string
        }
        Returns: Json
      }
      take_maya_chat_message: {
        Args: {
          p_call: string
          p_child: string
          p_end: string
          p_fingerprint: string
          p_id: string
          p_parent: string
          p_revision: number
          p_start: string
          p_text: string
        }
        Returns: Json
      }
      take_plan_read_order: { Args: never; Returns: number }
      team_end_plan_start: {
        Args: { p_admin: string; p_card: string; p_generation: number }
        Returns: boolean
      }
      use_workbook_run_attempts: {
        Args: {
          p_lease: string
          p_page: number
          p_run: string
          p_slots: string[]
        }
        Returns: boolean
      }
      workbook_book1_access: {
        Args: { p_child: string; p_parent: string }
        Returns: boolean
      }
      workbook_book1_baseline_command: {
        Args: {
          p_action: string
          p_actor: string
          p_child: string
          p_draft: string
          p_hash?: string
          p_parent: string
          p_payload?: string
          p_request: string
          p_run: string
        }
        Returns: Json
      }
      workbook_book1_sources: {
        Args: { p_child: string; p_parent: string; p_workbook: string }
        Returns: Json
      }
      workbook_comment_route: {
        Args: { p_note: string; p_page: Json; p_route?: string }
        Returns: string
      }
      workbook_edit_target_value: { Args: { p_value: Json }; Returns: Json }
      workbook_preview_access: {
        Args: {
          p_book: string
          p_child: string
          p_parent: string
          p_revision: string
        }
        Returns: boolean
      }
      workbook_preview_command: {
        Args: {
          p_action: string
          p_actor: string
          p_book: string
          p_child: string
          p_hash?: string
          p_parent: string
          p_payload?: string
          p_request: string
          p_revision: string
        }
        Returns: Json
      }
      workbook_run_held: {
        Args: { p_lease: string; p_run: string }
        Returns: boolean
      }
      write_workbook: {
        Args: { p_schema_version: number; p_workbook: Json }
        Returns: Json
      }
      yield_workbook_run: {
        Args: { p_lease: string; p_run: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
