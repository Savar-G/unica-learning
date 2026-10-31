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
          child_id: string | null
          clicks: number
          created_at: string
          email_id: string | null
          error: string | null
          first_clicked_at: string | null
          id: string
          kind: string
          last_clicked_at: string | null
          parent_id: string
          sent_at: string | null
          status: string | null
          unsubscribe_hash: string | null
        }
        Insert: {
          assessment_id?: string | null
          attempts?: number
          child_id?: string | null
          clicks?: number
          created_at?: string
          email_id?: string | null
          error?: string | null
          first_clicked_at?: string | null
          id?: string
          kind: string
          last_clicked_at?: string | null
          parent_id: string
          sent_at?: string | null
          status?: string | null
          unsubscribe_hash?: string | null
        }
        Update: {
          assessment_id?: string | null
          attempts?: number
          child_id?: string | null
          clicks?: number
          created_at?: string
          email_id?: string | null
          error?: string | null
          first_clicked_at?: string | null
          id?: string
          kind?: string
          last_clicked_at?: string | null
          parent_id?: string
          sent_at?: string | null
          status?: string | null
          unsubscribe_hash?: string | null
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
          reason: string
          requested_at: string
        }
        Insert: {
          lease_token?: string | null
          lease_until?: string | null
          parent_id: string
          phase?: string
          reason: string
          requested_at?: string
        }
        Update: {
          lease_token?: string | null
          lease_until?: string | null
          parent_id?: string
          phase?: string
          reason?: string
          requested_at?: string
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
        }
        Insert: {
          created_at?: string
          deletion_requested_at?: string | null
          email: string
          id: string
          name: string
          postal?: string | null
          source?: Json
        }
        Update: {
          created_at?: string
          deletion_requested_at?: string | null
          email?: string
          id?: string
          name?: string
          postal?: string | null
          source?: Json
        }
        Relationships: []
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
          schema_version: number
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
          schema_version: number
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
          schema_version?: number
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
      workbook_runs: {
        Row: {
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
          started_at: string | null
          started_by: string | null
          started_by_email: string | null
          status: string
          step: string | null
          total_pages: number | null
        }
        Insert: {
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
          started_at?: string | null
          started_by?: string | null
          started_by_email?: string | null
          status?: string
          step?: string | null
          total_pages?: number | null
        }
        Update: {
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
          started_at?: string | null
          started_by?: string | null
          started_by_email?: string | null
          status?: string
          step?: string | null
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
          printed_at: string | null
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
          printed_at?: string | null
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
          printed_at?: string | null
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
      abandon_family_payment_operation: {
        Args: {
          p: string
          resource_id: string
          resource_kind: string
          token: string
        }
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
        }[]
        SetofOptions: {
          from: "*"
          to: "parents"
          isOneToOne: false
          isSetofReturn: true
        }
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
      admin_team_ids: { Args: never; Returns: string[] }
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
      advance_family_deletion_cursor: {
        Args: { p: string }
        Returns: undefined
      }
      assert_family_writable: { Args: { p: string }; Returns: undefined }
      begin_booking_signup: { Args: { payload: Json }; Returns: boolean }
      begin_family_card_operation: {
        Args: { p: string; token: string }
        Returns: undefined
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
      check_family_payment_lease: {
        Args: { p: string; token: string }
        Returns: undefined
      }
      claim_family_deletion: {
        Args: { p: string; token: string }
        Returns: Json
      }
      claim_family_retention: {
        Args: { p: string; subscription_ended_at: string; token: string }
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
      claim_workbook_run: {
        Args: { p_lease: string; p_run: string }
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
      confirm_family_copies: {
        Args: { p: string; token: string }
        Returns: boolean
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
      end_family_card_operation: { Args: { token: string }; Returns: undefined }
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
      family_last_activity: { Args: { p: string }; Returns: string }
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
      is_admin: { Args: never; Returns: boolean }
      link_booking_family: {
        Args: { pid: string; sid: number }
        Returns: undefined
      }
      lock_booking_email: { Args: { mail: string }; Returns: undefined }
      lock_stage1: {
        Args: { p_answers: Json; p_assessment: string; p_route: string }
        Returns: string
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
      read_family_payment_progress: {
        Args: { customer: string; p: string; token: string }
        Returns: Json
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
      release_family_deletion: {
        Args: { p: string; token: string }
        Returns: undefined
      }
      renew_family_deletion: {
        Args: { p: string; token: string }
        Returns: boolean
      }
      renew_family_deletion_work: {
        Args: { p: string; token: string }
        Returns: boolean
      }
      request_family_deletion: {
        Args: { confirmation: string; p: string }
        Returns: string
      }
      resume_workbook_run: {
        Args: { p_lease: string; p_run: string; p_stale_seconds: number }
        Returns: boolean
      }
      retry_workbook_run: {
        Args: { p_error: string; p_lease: string; p_run: string }
        Returns: boolean
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
      save_workbook_rendering: { Args: { p_rendering: Json }; Returns: Json }
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
      save_workbook_run_page: {
        Args: { p_lease: string; p_number: number; p_page: Json; p_run: string }
        Returns: boolean
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
