
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "bookings": {
                  Row: {
                    "cancelled_at": string | null,"cancelled_by": string | null,"club_id": string,"court_id": string,"created_at": string,"created_by": string | null,"ends_at": string | null,"guest_name": string | null,"id": string,"match_id": string | null,"occupancy_id": string | null,"period": unknown,"player_id": string | null,"price": number,"series_id": string | null,"source": Database["public"]['Enums']["booking_source"],"starts_at": string | null,"status": Database["public"]['Enums']["booking_status"]
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"club_id": string,"court_id": string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"guest_name"?: string | null,"id"?: string,"match_id"?: string | null,"occupancy_id"?: string | null,"period": unknown,"player_id"?: string | null,"price": number,"series_id"?: string | null,"source": Database["public"]['Enums']["booking_source"],"starts_at"?: never,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"club_id"?: string,"court_id"?: string,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"guest_name"?: string | null,"id"?: string,"match_id"?: string | null,"occupancy_id"?: string | null,"period"?: unknown,"player_id"?: string | null,"price"?: number,"series_id"?: string | null,"source"?: Database["public"]['Enums']["booking_source"],"starts_at"?: never,"status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_court_in_club"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "bookings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "open_matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_occupancy_id_fkey"
      columns: ["occupancy_id"]
isOneToOne: true
      referencedRelation: "court_occupancy"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "recurring_series"
      referencedColumns: ["id"]
    }
                  ]
                },"championship_categories": {
                  Row: {
                    "championship_id": string,"club_id": string,"created_at": string,"format": Database["public"]['Enums']["championship_format"],"gender": Database["public"]['Enums']["championship_gender"],"group_size": number,"id": string,"level_max": number | null,"level_min": number | null,"match_minutes": number,"match_rules": NonNullable<Json>,"max_pairs": number,"merged_into": string | null,"min_pairs": number,"name": string,"price": number,"qualifiers_per_group": number,"seeding": Database["public"]['Enums']["championship_seeding"],"sort_order": number,"status": Database["public"]['Enums']["championship_category_status"]
                  }
                  Insert: {
                    "championship_id": string,"club_id": string,"created_at"?: string,"format"?: Database["public"]['Enums']["championship_format"],"gender"?: Database["public"]['Enums']["championship_gender"],"group_size"?: number,"id"?: string,"level_max"?: number | null,"level_min"?: number | null,"match_minutes"?: number,"match_rules"?: NonNullable<Json>,"max_pairs"?: number,"merged_into"?: string | null,"min_pairs"?: number,"name": string,"price": number,"qualifiers_per_group"?: number,"seeding"?: Database["public"]['Enums']["championship_seeding"],"sort_order"?: number,"status"?: Database["public"]['Enums']["championship_category_status"]
                  }
                  Update: {
                    "championship_id"?: string,"club_id"?: string,"created_at"?: string,"format"?: Database["public"]['Enums']["championship_format"],"gender"?: Database["public"]['Enums']["championship_gender"],"group_size"?: number,"id"?: string,"level_max"?: number | null,"level_min"?: number | null,"match_minutes"?: number,"match_rules"?: NonNullable<Json>,"max_pairs"?: number,"merged_into"?: string | null,"min_pairs"?: number,"name"?: string,"price"?: number,"qualifiers_per_group"?: number,"seeding"?: Database["public"]['Enums']["championship_seeding"],"sort_order"?: number,"status"?: Database["public"]['Enums']["championship_category_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "championship_categories_championship_in_club"
      columns: ["championship_id","club_id"]
isOneToOne: false
      referencedRelation: "championships"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_categories_merged_into_fkey"
      columns: ["merged_into"]
isOneToOne: false
      referencedRelation: "championship_categories"
      referencedColumns: ["id"]
    }
                  ]
                },"championship_entries": {
                  Row: {
                    "category_id": string,"club_id": string,"created_at": string,"created_by": string | null,"ended_at": string | null,"ended_by": string | null,"id": string,"note": string | null,"player1_id": string,"player1_level": number,"player2_id": string,"player2_level": number,"seed": number | null,"status": Database["public"]['Enums']["championship_entry_status"],"unavailability_approved": boolean,"unavailability_note": string | null
                  }
                  Insert: {
                    "category_id": string,"club_id": string,"created_at"?: string,"created_by"?: string | null,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"note"?: string | null,"player1_id": string,"player1_level": number,"player2_id": string,"player2_level": number,"seed"?: number | null,"status"?: Database["public"]['Enums']["championship_entry_status"],"unavailability_approved"?: boolean,"unavailability_note"?: string | null
                  }
                  Update: {
                    "category_id"?: string,"club_id"?: string,"created_at"?: string,"created_by"?: string | null,"ended_at"?: string | null,"ended_by"?: string | null,"id"?: string,"note"?: string | null,"player1_id"?: string,"player1_level"?: number,"player2_id"?: string,"player2_level"?: number,"seed"?: number | null,"status"?: Database["public"]['Enums']["championship_entry_status"],"unavailability_approved"?: boolean,"unavailability_note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "championship_entries_category_in_club"
      columns: ["category_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_categories"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "championship_entries_ended_by_fkey"
      columns: ["ended_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "championship_entries_player1_in_club"
      columns: ["player1_id","club_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_entries_player2_in_club"
      columns: ["player2_id","club_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"championship_group_members": {
                  Row: {
                    "club_id": string,"draw_position": number,"entry_id": string,"group_id": string,"place": number | null
                  }
                  Insert: {
                    "club_id": string,"draw_position": number,"entry_id": string,"group_id": string,"place"?: number | null
                  }
                  Update: {
                    "club_id"?: string,"draw_position"?: number,"entry_id"?: string,"group_id"?: string,"place"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "championship_group_members_entry_in_club"
      columns: ["entry_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_entries"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_group_members_group_in_club"
      columns: ["group_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_groups"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"championship_groups": {
                  Row: {
                    "category_id": string,"championship_id": string,"club_id": string,"id": string,"name": string,"sort_order": number
                  }
                  Insert: {
                    "category_id": string,"championship_id": string,"club_id": string,"id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "category_id"?: string,"championship_id"?: string,"club_id"?: string,"id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "championship_groups_category_in_club"
      columns: ["category_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_categories"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_groups_championship_in_club"
      columns: ["championship_id","club_id"]
isOneToOne: false
      referencedRelation: "championships"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"championship_match_sets": {
                  Row: {
                    "club_id": string,"games_a": number,"games_b": number,"match_id": string,"set_number": number,"super_tiebreak": boolean
                  }
                  Insert: {
                    "club_id": string,"games_a": number,"games_b": number,"match_id": string,"set_number": number,"super_tiebreak"?: boolean
                  }
                  Update: {
                    "club_id"?: string,"games_a"?: number,"games_b"?: number,"match_id"?: string,"set_number"?: number,"super_tiebreak"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "championship_match_sets_match_in_club"
      columns: ["match_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_matches"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"championship_matches": {
                  Row: {
                    "bracket_position": number | null,"category_id": string,"championship_id": string,"club_id": string,"court_id": string | null,"ends_at": string | null,"entry_a_id": string | null,"entry_b_id": string | null,"group_id": string | null,"id": string,"pinned": boolean,"recorded_at": string | null,"recorded_by": string | null,"round": number | null,"source_a": Json | null,"source_b": Json | null,"stage": Database["public"]['Enums']["championship_stage"],"starts_at": string | null,"status": Database["public"]['Enums']["championship_match_status"],"walkover_entry_id": string | null,"winner_entry_id": string | null
                  }
                  Insert: {
                    "bracket_position"?: number | null,"category_id": string,"championship_id": string,"club_id": string,"court_id"?: string | null,"ends_at"?: string | null,"entry_a_id"?: string | null,"entry_b_id"?: string | null,"group_id"?: string | null,"id"?: string,"pinned"?: boolean,"recorded_at"?: string | null,"recorded_by"?: string | null,"round"?: number | null,"source_a"?: Json | null,"source_b"?: Json | null,"stage": Database["public"]['Enums']["championship_stage"],"starts_at"?: string | null,"status"?: Database["public"]['Enums']["championship_match_status"],"walkover_entry_id"?: string | null,"winner_entry_id"?: string | null
                  }
                  Update: {
                    "bracket_position"?: number | null,"category_id"?: string,"championship_id"?: string,"club_id"?: string,"court_id"?: string | null,"ends_at"?: string | null,"entry_a_id"?: string | null,"entry_b_id"?: string | null,"group_id"?: string | null,"id"?: string,"pinned"?: boolean,"recorded_at"?: string | null,"recorded_by"?: string | null,"round"?: number | null,"source_a"?: Json | null,"source_b"?: Json | null,"stage"?: Database["public"]['Enums']["championship_stage"],"starts_at"?: string | null,"status"?: Database["public"]['Enums']["championship_match_status"],"walkover_entry_id"?: string | null,"winner_entry_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "championship_matches_category_in_club"
      columns: ["category_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_categories"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_matches_championship_in_club"
      columns: ["championship_id","club_id"]
isOneToOne: false
      referencedRelation: "championships"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_matches_court_id_fkey"
      columns: ["court_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "championship_matches_entry_a_in_club"
      columns: ["entry_a_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_entries"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_matches_entry_b_in_club"
      columns: ["entry_b_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_entries"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_matches_group_in_club"
      columns: ["group_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_groups"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "championship_matches_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "championship_matches_winner_in_club"
      columns: ["winner_entry_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_entries"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"championship_windows": {
                  Row: {
                    "championship_id": string,"club_id": string,"court_ids": (string)[],"from_time": string,"id": string,"on_date": string,"to_time": string
                  }
                  Insert: {
                    "championship_id": string,"club_id": string,"court_ids": (string)[],"from_time": string,"id"?: string,"on_date": string,"to_time": string
                  }
                  Update: {
                    "championship_id"?: string,"club_id"?: string,"court_ids"?: (string)[],"from_time"?: string,"id"?: string,"on_date"?: string,"to_time"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "championship_windows_championship_in_club"
      columns: ["championship_id","club_id"]
isOneToOne: false
      referencedRelation: "championships"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"championships": {
                  Row: {
                    "cancelled_at": string | null,"club_id": string,"created_at": string,"created_by": string | null,"draw_seed": number | null,"id": string,"max_categories_per_player": number,"name": string,"poster_path": string | null,"public_code": string | null,"registration_closes_at": string | null,"registration_opens_at": string | null,"rules": string,"status": Database["public"]['Enums']["championship_status"]
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"club_id": string,"created_at"?: string,"created_by"?: string | null,"draw_seed"?: number | null,"id"?: string,"max_categories_per_player"?: number,"name": string,"poster_path"?: string | null,"public_code"?: string | null,"registration_closes_at"?: string | null,"registration_opens_at"?: string | null,"rules"?: string,"status"?: Database["public"]['Enums']["championship_status"]
                  }
                  Update: {
                    "cancelled_at"?: string | null,"club_id"?: string,"created_at"?: string,"created_by"?: string | null,"draw_seed"?: number | null,"id"?: string,"max_categories_per_player"?: number,"name"?: string,"poster_path"?: string | null,"public_code"?: string | null,"registration_closes_at"?: string | null,"registration_opens_at"?: string | null,"rules"?: string,"status"?: Database["public"]['Enums']["championship_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "championships_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "championships_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"club_members": {
                  Row: {
                    "category": number | null,"category_validated": boolean,"club_id": string,"created_at": string,"role": Database["public"]['Enums']["club_role"],"user_id": string
                  }
                  Insert: {
                    "category"?: number | null,"category_validated"?: boolean,"club_id": string,"created_at"?: string,"role"?: Database["public"]['Enums']["club_role"],"user_id": string
                  }
                  Update: {
                    "category"?: number | null,"category_validated"?: boolean,"club_id"?: string,"created_at"?: string,"role"?: Database["public"]['Enums']["club_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "club_members_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "club_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clubs": {
                  Row: {
                    "accepts_cash": boolean,"accepts_transfer": boolean,"booking_window_days": number,"cancellation_notice_hours": number,"closes_at": string,"created_at": string,"id": string,"logo_path": string | null,"loyalty_discount_percent": number,"loyalty_enabled": boolean,"loyalty_every": number,"loyalty_expiry_months": number | null,"match_close_hours": number,"max_active_bookings": number,"name": string,"opens_at": string,"slot_minutes": number,"slug": string,"timezone": string,"transfer_details": string | null,"transfer_receipt_required": boolean
                  }
                  Insert: {
                    "accepts_cash"?: boolean,"accepts_transfer"?: boolean,"booking_window_days"?: number,"cancellation_notice_hours"?: number,"closes_at"?: string,"created_at"?: string,"id"?: string,"logo_path"?: string | null,"loyalty_discount_percent"?: number,"loyalty_enabled"?: boolean,"loyalty_every"?: number,"loyalty_expiry_months"?: number | null,"match_close_hours"?: number,"max_active_bookings"?: number,"name": string,"opens_at"?: string,"slot_minutes"?: number,"slug": string,"timezone"?: string,"transfer_details"?: string | null,"transfer_receipt_required"?: boolean
                  }
                  Update: {
                    "accepts_cash"?: boolean,"accepts_transfer"?: boolean,"booking_window_days"?: number,"cancellation_notice_hours"?: number,"closes_at"?: string,"created_at"?: string,"id"?: string,"logo_path"?: string | null,"loyalty_discount_percent"?: number,"loyalty_enabled"?: boolean,"loyalty_every"?: number,"loyalty_expiry_months"?: number | null,"match_close_hours"?: number,"max_active_bookings"?: number,"name"?: string,"opens_at"?: string,"slot_minutes"?: number,"slug"?: string,"timezone"?: string,"transfer_details"?: string | null,"transfer_receipt_required"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"court_occupancy": {
                  Row: {
                    "championship_id": string | null,"club_id": string,"court_id": string,"created_at": string,"created_by": string | null,"day_use_product_id": string | null,"ends_at": string | null,"expires_at": string | null,"id": string,"kind": Database["public"]['Enums']["occupancy_kind"],"note": string | null,"period": unknown,"starts_at": string | null,"tournament_id": string | null
                  }
                  Insert: {
                    "championship_id"?: string | null,"club_id": string,"court_id": string,"created_at"?: string,"created_by"?: string | null,"day_use_product_id"?: string | null,"ends_at"?: never,"expires_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["occupancy_kind"],"note"?: string | null,"period": unknown,"starts_at"?: never,"tournament_id"?: string | null
                  }
                  Update: {
                    "championship_id"?: string | null,"club_id"?: string,"court_id"?: string,"created_at"?: string,"created_by"?: string | null,"day_use_product_id"?: string | null,"ends_at"?: never,"expires_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["occupancy_kind"],"note"?: string | null,"period"?: unknown,"starts_at"?: never,"tournament_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "court_occupancy_championship_id_fkey"
      columns: ["championship_id"]
isOneToOne: false
      referencedRelation: "championships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "court_occupancy_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "court_occupancy_court_in_club"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "court_occupancy_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "court_occupancy_day_use_product_id_fkey"
      columns: ["day_use_product_id"]
isOneToOne: false
      referencedRelation: "day_use_products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "court_occupancy_tournament_id_fkey"
      columns: ["tournament_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id"]
    }
                  ]
                },"courts": {
                  Row: {
                    "club_id": string,"created_at": string,"id": string,"is_active": boolean,"is_covered": boolean,"name": string,"sort_order": number
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_covered"?: boolean,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_covered"?: boolean,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "courts_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    }
                  ]
                },"day_use_overrides": {
                  Row: {
                    "club_id": string,"created_at": string,"created_by": string | null,"enabled": boolean,"id": string,"on_date": string,"product_id": string
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"created_by"?: string | null,"enabled": boolean,"id"?: string,"on_date": string,"product_id": string
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"id"?: string,"on_date"?: string,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "day_use_overrides_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "day_use_overrides_product_in_club"
      columns: ["product_id","club_id"]
isOneToOne: false
      referencedRelation: "day_use_products"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"day_use_passes": {
                  Row: {
                    "cancelled_at": string | null,"cancelled_by": string | null,"checked_in_at": string | null,"checked_in_by": string | null,"club_id": string,"code": string,"created_at": string,"created_by": string | null,"discount_percent": number,"guest_name": string | null,"id": string,"on_date": string,"player_id": string | null,"price": number,"product_id": string,"source": Database["public"]['Enums']["booking_source"],"status": Database["public"]['Enums']["day_use_pass_status"],"total": number | null,"used_reward": boolean
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"checked_in_at"?: string | null,"checked_in_by"?: string | null,"club_id": string,"code": string,"created_at"?: string,"created_by"?: string | null,"discount_percent"?: number,"guest_name"?: string | null,"id"?: string,"on_date": string,"player_id"?: string | null,"price": number,"product_id": string,"source": Database["public"]['Enums']["booking_source"],"status"?: Database["public"]['Enums']["day_use_pass_status"],"total"?: never,"used_reward"?: boolean
                  }
                  Update: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"checked_in_at"?: string | null,"checked_in_by"?: string | null,"club_id"?: string,"code"?: string,"created_at"?: string,"created_by"?: string | null,"discount_percent"?: number,"guest_name"?: string | null,"id"?: string,"on_date"?: string,"player_id"?: string | null,"price"?: number,"product_id"?: string,"source"?: Database["public"]['Enums']["booking_source"],"status"?: Database["public"]['Enums']["day_use_pass_status"],"total"?: never,"used_reward"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "day_use_passes_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "day_use_passes_checked_in_by_fkey"
      columns: ["checked_in_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "day_use_passes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "day_use_passes_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "day_use_passes_product_in_club"
      columns: ["product_id","club_id"]
isOneToOne: false
      referencedRelation: "day_use_products"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"day_use_products": {
                  Row: {
                    "capacity": number,"club_id": string,"court_ids": (string)[],"created_at": string,"created_by": string | null,"from_time": string,"generated_until": string | null,"id": string,"includes": (string)[],"is_active": boolean,"name": string,"price": number,"sort_order": number,"to_time": string,"weekdays": (number)[]
                  }
                  Insert: {
                    "capacity": number,"club_id": string,"court_ids"?: (string)[],"created_at"?: string,"created_by"?: string | null,"from_time": string,"generated_until"?: string | null,"id"?: string,"includes"?: (string)[],"is_active"?: boolean,"name": string,"price": number,"sort_order"?: number,"to_time": string,"weekdays": (number)[]
                  }
                  Update: {
                    "capacity"?: number,"club_id"?: string,"court_ids"?: (string)[],"created_at"?: string,"created_by"?: string | null,"from_time"?: string,"generated_until"?: string | null,"id"?: string,"includes"?: (string)[],"is_active"?: boolean,"name"?: string,"price"?: number,"sort_order"?: number,"to_time"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "day_use_products_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "day_use_products_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"entry_unavailability": {
                  Row: {
                    "club_id": string,"entry_id": string,"from_time": string,"id": string,"on_date": string,"to_time": string
                  }
                  Insert: {
                    "club_id": string,"entry_id": string,"from_time": string,"id"?: string,"on_date": string,"to_time": string
                  }
                  Update: {
                    "club_id"?: string,"entry_id"?: string,"from_time"?: string,"id"?: string,"on_date"?: string,"to_time"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entry_unavailability_entry_in_club"
      columns: ["entry_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_entries"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"match_slots": {
                  Row: {
                    "club_id": string,"joined_at": string | null,"match_id": string,"player_id": string | null,"position": number,"side": Database["public"]['Enums']["player_side"],"team": string
                  }
                  Insert: {
                    "club_id": string,"joined_at"?: string | null,"match_id": string,"player_id"?: string | null,"position": number,"side": Database["public"]['Enums']["player_side"],"team": string
                  }
                  Update: {
                    "club_id"?: string,"joined_at"?: string | null,"match_id"?: string,"player_id"?: string | null,"position"?: number,"side"?: Database["public"]['Enums']["player_side"],"team"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_slots_match_in_club"
      columns: ["match_id","club_id"]
isOneToOne: false
      referencedRelation: "open_matches"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "match_slots_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "club_id": string,"created_at": string,"data": NonNullable<Json>,"email_attempts": number,"email_locked_until": string | null,"email_status": Database["public"]['Enums']["email_status"],"emailed_at": string | null,"id": string,"kind": Database["public"]['Enums']["notification_kind"],"link": string,"read_at": string | null,"user_id": string
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"data"?: NonNullable<Json>,"email_attempts"?: number,"email_locked_until"?: string | null,"email_status"?: Database["public"]['Enums']["email_status"],"emailed_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["notification_kind"],"link": string,"read_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"email_attempts"?: number,"email_locked_until"?: string | null,"email_status"?: Database["public"]['Enums']["email_status"],"emailed_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["notification_kind"],"link"?: string,"read_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"open_matches": {
                  Row: {
                    "allow_other_court": boolean,"booking_id": string | null,"cancel_note": string | null,"cancel_reason": string | null,"cancelled_at": string | null,"category_max": number,"category_min": number,"club_id": string,"court_id": string | null,"created_at": string,"created_by": string | null,"ends_at": string | null,"id": string,"match_type": Database["public"]['Enums']["match_type"],"period": unknown,"preferred_court_id": string,"starts_at": string | null,"status": Database["public"]['Enums']["match_status"]
                  }
                  Insert: {
                    "allow_other_court"?: boolean,"booking_id"?: string | null,"cancel_note"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"category_max": number,"category_min": number,"club_id": string,"court_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"id"?: string,"match_type": Database["public"]['Enums']["match_type"],"period": unknown,"preferred_court_id": string,"starts_at"?: never,"status"?: Database["public"]['Enums']["match_status"]
                  }
                  Update: {
                    "allow_other_court"?: boolean,"booking_id"?: string | null,"cancel_note"?: string | null,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"category_max"?: number,"category_min"?: number,"club_id"?: string,"court_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"id"?: string,"match_type"?: Database["public"]['Enums']["match_type"],"period"?: unknown,"preferred_court_id"?: string,"starts_at"?: never,"status"?: Database["public"]['Enums']["match_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "open_matches_booking_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "open_matches_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "open_matches_court_fkey"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "open_matches_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "open_matches_preferred_court_fkey"
      columns: ["preferred_court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"booking_id": string | null,"championship_entry_id": string | null,"club_id": string,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"day_use_pass_id": string | null,"id": string,"method": Database["public"]['Enums']["payment_method"],"payer_id": string | null,"receipt_path": string | null,"rejection_reason": string | null,"reported_by": string | null,"status": Database["public"]['Enums']["payment_status"],"tournament_entry_id": string | null
                  }
                  Insert: {
                    "amount": number,"booking_id"?: string | null,"championship_entry_id"?: string | null,"club_id": string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"day_use_pass_id"?: string | null,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"payer_id"?: string | null,"receipt_path"?: string | null,"rejection_reason"?: string | null,"reported_by"?: string | null,"status": Database["public"]['Enums']["payment_status"],"tournament_entry_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"booking_id"?: string | null,"championship_entry_id"?: string | null,"club_id"?: string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"day_use_pass_id"?: string | null,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"payer_id"?: string | null,"receipt_path"?: string | null,"rejection_reason"?: string | null,"reported_by"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"tournament_entry_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_in_club"
      columns: ["booking_id","club_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "payments_championship_entry_in_club"
      columns: ["championship_entry_id","club_id"]
isOneToOne: false
      referencedRelation: "championship_entries"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "payments_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_entry_in_club"
      columns: ["tournament_entry_id","club_id"]
isOneToOne: false
      referencedRelation: "tournament_entries"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "payments_pass_in_club"
      columns: ["day_use_pass_id","club_id"]
isOneToOne: false
      referencedRelation: "day_use_passes"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "payments_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_reported_by_fkey"
      columns: ["reported_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"player_availability": {
                  Row: {
                    "band": Database["public"]['Enums']["day_band"],"user_id": string,"weekday": number
                  }
                  Insert: {
                    "band": Database["public"]['Enums']["day_band"],"user_id": string,"weekday": number
                  }
                  Update: {
                    "band"?: Database["public"]['Enums']["day_band"],"user_id"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_availability_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"player_preferred_courts": {
                  Row: {
                    "court_id": string,"user_id": string
                  }
                  Insert: {
                    "court_id": string,"user_id": string
                  }
                  Update: {
                    "court_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_preferred_courts_court_id_fkey"
      columns: ["court_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "player_preferred_courts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "club_id": string,"created_at": string,"created_by": string | null,"email": string | null,"id": string,"name": string,"phone": string | null,"profile_id": string | null
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"name": string,"phone"?: string | null,"profile_id"?: string | null
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"name"?: string,"phone"?: string | null,"profile_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "players_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "players_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pricing_rules": {
                  Row: {
                    "club_id": string,"created_at": string,"from_time": string,"id": string,"price": number,"to_time": string,"weekdays": (number)[]
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"from_time": string,"id"?: string,"price": number,"to_time": string,"weekdays": (number)[]
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"from_time"?: string,"id"?: string,"price"?: number,"to_time"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "pricing_rules_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"gender": Database["public"]['Enums']["gender"] | null,"hand": Database["public"]['Enums']["dominant_hand"] | null,"id": string,"is_public": boolean,"show_in_club": boolean,"side": Database["public"]['Enums']["player_side"] | null
                  }
                  Insert: {
                    "created_at"?: string,"display_name": string,"gender"?: Database["public"]['Enums']["gender"] | null,"hand"?: Database["public"]['Enums']["dominant_hand"] | null,"id": string,"is_public"?: boolean,"show_in_club"?: boolean,"side"?: Database["public"]['Enums']["player_side"] | null
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"gender"?: Database["public"]['Enums']["gender"] | null,"hand"?: Database["public"]['Enums']["dominant_hand"] | null,"id"?: string,"is_public"?: boolean,"show_in_club"?: boolean,"side"?: Database["public"]['Enums']["player_side"] | null
                  }
                  Relationships: [
                    
                  ]
                },"recurring_series": {
                  Row: {
                    "club_id": string,"court_id": string,"created_at": string,"created_by": string | null,"ends_on": string | null,"generated_until": string | null,"guest_name": string | null,"id": string,"player_id": string | null,"start_time": string,"starts_on": string,"weekday": number
                  }
                  Insert: {
                    "club_id": string,"court_id": string,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"generated_until"?: string | null,"guest_name"?: string | null,"id"?: string,"player_id"?: string | null,"start_time": string,"starts_on": string,"weekday": number
                  }
                  Update: {
                    "club_id"?: string,"court_id"?: string,"created_at"?: string,"created_by"?: string | null,"ends_on"?: string | null,"generated_until"?: string | null,"guest_name"?: string | null,"id"?: string,"player_id"?: string | null,"start_time"?: string,"starts_on"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_series_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_series_court_in_club"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "recurring_series_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_series_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recurring_series_skips": {
                  Row: {
                    "club_id": string,"created_at": string,"id": string,"on_date": string,"reason": string,"series_id": string
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"id"?: string,"on_date": string,"reason": string,"series_id": string
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"id"?: string,"on_date"?: string,"reason"?: string,"series_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_series_skips_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_series_skips_series_id_fkey"
      columns: ["series_id"]
isOneToOne: false
      referencedRelation: "recurring_series"
      referencedColumns: ["id"]
    }
                  ]
                },"slot_holds": {
                  Row: {
                    "booking_id": string | null,"club_id": string,"court_id": string,"created_at": string,"ended_at": string | null,"expires_at": string,"id": string,"occupancy_id": string | null,"period": unknown,"player_id": string,"starts_at": string | null,"status": Database["public"]['Enums']["slot_hold_status"],"wait_id": string
                  }
                  Insert: {
                    "booking_id"?: string | null,"club_id": string,"court_id": string,"created_at"?: string,"ended_at"?: string | null,"expires_at": string,"id"?: string,"occupancy_id"?: string | null,"period": unknown,"player_id": string,"starts_at"?: never,"status"?: Database["public"]['Enums']["slot_hold_status"],"wait_id": string
                  }
                  Update: {
                    "booking_id"?: string | null,"club_id"?: string,"court_id"?: string,"created_at"?: string,"ended_at"?: string | null,"expires_at"?: string,"id"?: string,"occupancy_id"?: string | null,"period"?: unknown,"player_id"?: string,"starts_at"?: never,"status"?: Database["public"]['Enums']["slot_hold_status"],"wait_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "slot_holds_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slot_holds_court_in_club"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "slot_holds_occupancy_id_fkey"
      columns: ["occupancy_id"]
isOneToOne: true
      referencedRelation: "court_occupancy"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slot_holds_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slot_holds_wait_in_club"
      columns: ["wait_id","club_id"]
isOneToOne: false
      referencedRelation: "slot_waits"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"slot_waits": {
                  Row: {
                    "club_id": string,"court_ids": (string)[],"created_at": string,"ended_at": string | null,"from_time": string,"id": string,"on_date": string,"player_id": string,"status": Database["public"]['Enums']["slot_wait_status"],"to_time": string
                  }
                  Insert: {
                    "club_id": string,"court_ids"?: (string)[],"created_at"?: string,"ended_at"?: string | null,"from_time": string,"id"?: string,"on_date": string,"player_id": string,"status"?: Database["public"]['Enums']["slot_wait_status"],"to_time": string
                  }
                  Update: {
                    "club_id"?: string,"court_ids"?: (string)[],"created_at"?: string,"ended_at"?: string | null,"from_time"?: string,"id"?: string,"on_date"?: string,"player_id"?: string,"status"?: Database["public"]['Enums']["slot_wait_status"],"to_time"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "slot_waits_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "slot_waits_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tournament_entries": {
                  Row: {
                    "club_id": string,"created_at": string,"created_by": string | null,"guest_name": string | null,"id": string,"player_id": string | null,"removed_at": string | null,"removed_by": string | null,"tournament_id": string
                  }
                  Insert: {
                    "club_id": string,"created_at"?: string,"created_by"?: string | null,"guest_name"?: string | null,"id"?: string,"player_id"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"tournament_id": string
                  }
                  Update: {
                    "club_id"?: string,"created_at"?: string,"created_by"?: string | null,"guest_name"?: string | null,"id"?: string,"player_id"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"tournament_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tournament_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournament_entries_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournament_entries_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournament_entries_tournament_in_club"
      columns: ["tournament_id","club_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"tournament_games": {
                  Row: {
                    "a1_entry_id": string,"a2_entry_id": string,"b1_entry_id": string,"b2_entry_id": string,"club_id": string,"court_id": string,"id": string,"recorded_at": string | null,"recorded_by": string | null,"round": number,"score_a": number | null,"starts_at": string,"tournament_id": string,"wave": number
                  }
                  Insert: {
                    "a1_entry_id": string,"a2_entry_id": string,"b1_entry_id": string,"b2_entry_id": string,"club_id": string,"court_id": string,"id"?: string,"recorded_at"?: string | null,"recorded_by"?: string | null,"round": number,"score_a"?: number | null,"starts_at": string,"tournament_id": string,"wave": number
                  }
                  Update: {
                    "a1_entry_id"?: string,"a2_entry_id"?: string,"b1_entry_id"?: string,"b2_entry_id"?: string,"club_id"?: string,"court_id"?: string,"id"?: string,"recorded_at"?: string | null,"recorded_by"?: string | null,"round"?: number,"score_a"?: number | null,"starts_at"?: string,"tournament_id"?: string,"wave"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tournament_games_a1_entry_id_fkey"
      columns: ["a1_entry_id"]
isOneToOne: false
      referencedRelation: "tournament_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournament_games_a2_entry_id_fkey"
      columns: ["a2_entry_id"]
isOneToOne: false
      referencedRelation: "tournament_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournament_games_b1_entry_id_fkey"
      columns: ["b1_entry_id"]
isOneToOne: false
      referencedRelation: "tournament_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournament_games_b2_entry_id_fkey"
      columns: ["b2_entry_id"]
isOneToOne: false
      referencedRelation: "tournament_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournament_games_court_in_club"
      columns: ["court_id","club_id"]
isOneToOne: false
      referencedRelation: "courts"
      referencedColumns: ["id","club_id"]
    },{
      foreignKeyName: "tournament_games_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournament_games_tournament_in_club"
      columns: ["tournament_id","club_id"]
isOneToOne: false
      referencedRelation: "tournaments"
      referencedColumns: ["id","club_id"]
    }
                  ]
                },"tournaments": {
                  Row: {
                    "cancelled_at": string | null,"category_max": number,"category_min": number,"club_id": string,"court_ids": (string)[],"created_at": string,"created_by": string | null,"ends_at": string | null,"id": string,"match_type": Database["public"]['Enums']["match_type"],"max_players": number,"name": string,"period": unknown,"points_per_game": number,"price": number,"round_minutes": number,"rounds": number,"starts_at": string | null,"status": Database["public"]['Enums']["tournament_status"]
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"category_max": number,"category_min": number,"club_id": string,"court_ids": (string)[],"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"id"?: string,"match_type": Database["public"]['Enums']["match_type"],"max_players": number,"name": string,"period": unknown,"points_per_game"?: number,"price": number,"round_minutes"?: number,"rounds"?: number,"starts_at"?: never,"status"?: Database["public"]['Enums']["tournament_status"]
                  }
                  Update: {
                    "cancelled_at"?: string | null,"category_max"?: number,"category_min"?: number,"club_id"?: string,"court_ids"?: (string)[],"created_at"?: string,"created_by"?: string | null,"ends_at"?: never,"id"?: string,"match_type"?: Database["public"]['Enums']["match_type"],"max_players"?: number,"name"?: string,"period"?: unknown,"points_per_game"?: number,"price"?: number,"round_minutes"?: number,"rounds"?: number,"starts_at"?: never,"status"?: Database["public"]['Enums']["tournament_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "tournaments_club_id_fkey"
      columns: ["club_id"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tournaments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_championship_category":
{ Args: { "p_championship_id": string,"p_format": Database["public"]['Enums']["championship_format"],"p_gender": Database["public"]['Enums']["championship_gender"],"p_golden_point": boolean,"p_group_size": number,"p_level_max"?: number,"p_level_min"?: number,"p_match_minutes": number,"p_max_pairs": number,"p_min_pairs": number,"p_name": string,"p_price": number,"p_qualifiers": number,"p_seeding": Database["public"]['Enums']["championship_seeding"],"p_third_set": string,"p_time_limit"?: number }; Returns: {
              "championship_id": string,
"club_id": string,
"created_at": string,
"format": Database["public"]['Enums']["championship_format"],
"gender": Database["public"]['Enums']["championship_gender"],
"group_size": number,
"id": string,
"level_max": number | null,
"level_min": number | null,
"match_minutes": number,
"match_rules": NonNullable<Json>,
"max_pairs": number,
"merged_into": string | null,
"min_pairs": number,
"name": string,
"price": number,
"qualifiers_per_group": number,
"seeding": Database["public"]['Enums']["championship_seeding"],
"sort_order": number,
"status": Database["public"]['Enums']["championship_category_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "championship_categories"
        isOneToOne: true
        isSetofReturn: false
      } },
"add_championship_pair":
{ Args: { "p_category_id": string,"p_note"?: string,"p_player1_level": number,"p_player1_name"?: string,"p_player1_phone"?: string,"p_player1_profile_id"?: string,"p_player2_level": number,"p_player2_name"?: string,"p_player2_phone"?: string,"p_player2_profile_id"?: string }; Returns: {
              "category_id": string,
"club_id": string,
"created_at": string,
"created_by": string | null,
"ended_at": string | null,
"ended_by": string | null,
"id": string,
"note": string | null,
"player1_id": string,
"player1_level": number,
"player2_id": string,
"player2_level": number,
"seed": number | null,
"status": Database["public"]['Enums']["championship_entry_status"],
"unavailability_approved": boolean,
"unavailability_note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "championship_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"add_championship_window":
{ Args: { "p_championship_id": string,"p_court_ids": (string)[],"p_date": string,"p_from": string,"p_to": string }; Returns: {
              "championship_id": string,
"club_id": string,
"court_ids": (string)[],
"from_time": string,
"id": string,
"on_date": string,
"to_time": string
            }
                          SetofOptions: {
        from: "*"
        to: "championship_windows"
        isOneToOne: true
        isSetofReturn: false
      } },
"add_tournament_guest":
{ Args: { "p_name": string,"p_tournament_id": string }; Returns: {
              "club_id": string,
"created_at": string,
"created_by": string | null,
"guest_name": string | null,
"id": string,
"player_id": string | null,
"removed_at": string | null,
"removed_by": string | null,
"tournament_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "tournament_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"block_court":
{ Args: { "p_court_id": string,"p_ends_at": string,"p_note"?: string,"p_starts_at": string }; Returns: {
              "championship_id": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"day_use_product_id": string | null,
"ends_at": string | null,
"expires_at": string | null,
"id": string,
"kind": Database["public"]['Enums']["occupancy_kind"],
"note": string | null,
"period": unknown,
"starts_at": string | null,
"tournament_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "court_occupancy"
        isOneToOne: true
        isSetofReturn: false
      } },
"book_slot":
{ Args: { "p_court_id": string,"p_starts_at": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"guest_name": string | null,
"id": string,
"match_id": string | null,
"occupancy_id": string | null,
"period": unknown,
"player_id": string | null,
"price": number,
"series_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"starts_at": string | null,
"status": Database["public"]['Enums']["booking_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"buy_day_use":
{ Args: { "p_date": string,"p_product_id": string,"p_use_reward"?: boolean }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"checked_in_at": string | null,
"checked_in_by": string | null,
"club_id": string,
"code": string,
"created_at": string,
"created_by": string | null,
"discount_percent": number,
"guest_name": string | null,
"id": string,
"on_date": string,
"player_id": string | null,
"price": number,
"product_id": string,
"source": Database["public"]['Enums']["booking_source"],
"status": Database["public"]['Enums']["day_use_pass_status"],
"total": number | null,
"used_reward": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "day_use_passes"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_booking":
{ Args: { "p_booking_id": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"guest_name": string | null,
"id": string,
"match_id": string | null,
"occupancy_id": string | null,
"period": unknown,
"player_id": string | null,
"price": number,
"series_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"starts_at": string | null,
"status": Database["public"]['Enums']["booking_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_championship":
{ Args: { "p_championship_id": string }; Returns: {
              "cancelled_at": string | null,
"club_id": string,
"created_at": string,
"created_by": string | null,
"draw_seed": number | null,
"id": string,
"max_categories_per_player": number,
"name": string,
"poster_path": string | null,
"public_code": string | null,
"registration_closes_at": string | null,
"registration_opens_at": string | null,
"rules": string,
"status": Database["public"]['Enums']["championship_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "championships"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_championship_category":
{ Args: { "p_category_id": string }; Returns: {
              "championship_id": string,
"club_id": string,
"created_at": string,
"format": Database["public"]['Enums']["championship_format"],
"gender": Database["public"]['Enums']["championship_gender"],
"group_size": number,
"id": string,
"level_max": number | null,
"level_min": number | null,
"match_minutes": number,
"match_rules": NonNullable<Json>,
"max_pairs": number,
"merged_into": string | null,
"min_pairs": number,
"name": string,
"price": number,
"qualifiers_per_group": number,
"seeding": Database["public"]['Enums']["championship_seeding"],
"sort_order": number,
"status": Database["public"]['Enums']["championship_category_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "championship_categories"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_day_use":
{ Args: { "p_pass_id": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"checked_in_at": string | null,
"checked_in_by": string | null,
"club_id": string,
"code": string,
"created_at": string,
"created_by": string | null,
"discount_percent": number,
"guest_name": string | null,
"id": string,
"on_date": string,
"player_id": string | null,
"price": number,
"product_id": string,
"source": Database["public"]['Enums']["booking_source"],
"status": Database["public"]['Enums']["day_use_pass_status"],
"total": number | null,
"used_reward": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "day_use_passes"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_match":
{ Args: { "p_match_id": string,"p_note"?: string }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_my_booking":
{ Args: { "p_booking_id": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"guest_name": string | null,
"id": string,
"match_id": string | null,
"occupancy_id": string | null,
"period": unknown,
"player_id": string | null,
"price": number,
"series_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"starts_at": string | null,
"status": Database["public"]['Enums']["booking_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_slot_wait":
{ Args: { "p_wait_id": string }; Returns: {
              "club_id": string,
"court_ids": (string)[],
"created_at": string,
"ended_at": string | null,
"from_time": string,
"id": string,
"on_date": string,
"player_id": string,
"status": Database["public"]['Enums']["slot_wait_status"],
"to_time": string
            }
                          SetofOptions: {
        from: "*"
        to: "slot_waits"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_tournament":
{ Args: { "p_tournament_id": string }; Returns: {
              "cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_ids": (string)[],
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"max_players": number,
"name": string,
"period": unknown,
"points_per_game": number,
"price": number,
"round_minutes": number,
"rounds": number,
"starts_at": string | null,
"status": Database["public"]['Enums']["tournament_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "tournaments"
        isOneToOne: true
        isSetofReturn: false
      } },
"championship_contacts":
{ Args: { "p_championship_id": string }; Returns: {
              "email": string,"phone": string,"player_id": string
            }[]
                           },
"championship_entry_notes":
{ Args: { "p_championship_id": string }; Returns: {
              "entry_id": string,"note": string,"unavailability_note": string
            }[]
                           },
"check_in_day_use":
{ Args: { "p_pass_id": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"checked_in_at": string | null,
"checked_in_by": string | null,
"club_id": string,
"code": string,
"created_at": string,
"created_by": string | null,
"discount_percent": number,
"guest_name": string | null,
"id": string,
"on_date": string,
"player_id": string | null,
"price": number,
"product_id": string,
"source": Database["public"]['Enums']["booking_source"],
"status": Database["public"]['Enums']["day_use_pass_status"],
"total": number | null,
"used_reward": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "day_use_passes"
        isOneToOne: true
        isSetofReturn: false
      } },
"claim_notification_emails":
{ Args: { "p_limit"?: number }; Returns: {
              "club_logo_path": string,"club_name": string,"club_timezone": string,"data": Json,"email": string,"kind": Database["public"]['Enums']["notification_kind"],"link": string,"notification_id": string,"player_name": string
            }[]
                           },
"claim_slot_hold":
{ Args: { "p_hold_id": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"guest_name": string | null,
"id": string,
"match_id": string | null,
"occupancy_id": string | null,
"period": unknown,
"player_id": string | null,
"price": number,
"series_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"starts_at": string | null,
"status": Database["public"]['Enums']["booking_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"close_championship_registration":
{ Args: { "p_championship_id": string }; Returns: {
              "cancelled_at": string | null,
"club_id": string,
"created_at": string,
"created_by": string | null,
"draw_seed": number | null,
"id": string,
"max_categories_per_player": number,
"name": string,
"poster_path": string | null,
"public_code": string | null,
"registration_closes_at": string | null,
"registration_opens_at": string | null,
"rules": string,
"status": Database["public"]['Enums']["championship_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "championships"
        isOneToOne: true
        isSetofReturn: false
      } },
"close_matches":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"close_tournament_registration":
{ Args: { "p_tournament_id": string }; Returns: {
              "cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_ids": (string)[],
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"max_players": number,
"name": string,
"period": unknown,
"points_per_game": number,
"price": number,
"round_minutes": number,
"rounds": number,
"starts_at": string | null,
"status": Database["public"]['Enums']["tournament_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "tournaments"
        isOneToOne: true
        isSetofReturn: false
      } },
"confirm_payment":
{ Args: { "p_payment_id": string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_championship":
{ Args: { "p_club_id": string,"p_max_categories"?: number,"p_name": string,"p_registration_closes_at"?: string,"p_rules"?: string }; Returns: {
              "cancelled_at": string | null,
"club_id": string,
"created_at": string,
"created_by": string | null,
"draw_seed": number | null,
"id": string,
"max_categories_per_player": number,
"name": string,
"poster_path": string | null,
"public_code": string | null,
"registration_closes_at": string | null,
"registration_opens_at": string | null,
"rules": string,
"status": Database["public"]['Enums']["championship_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "championships"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_match":
{ Args: { "p_allow_other_court": boolean,"p_category_max": number,"p_category_min": number,"p_court_id": string,"p_match_type": Database["public"]['Enums']["match_type"],"p_side": Database["public"]['Enums']["player_side"],"p_starts_at": string }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_series":
{ Args: { "p_court_id": string,"p_ends_on"?: string,"p_guest_name"?: string,"p_player_id"?: string,"p_start_time": string,"p_starts_on": string,"p_weekday": number }; Returns: {
              "club_id": string,
"created_at": string,
"id": string,
"on_date": string,
"reason": string,
"series_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "recurring_series_skips"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_slot_wait":
{ Args: { "p_club_id": string,"p_court_ids"?: (string)[],"p_date": string,"p_from": string,"p_to": string }; Returns: {
              "club_id": string,
"court_ids": (string)[],
"created_at": string,
"ended_at": string | null,
"from_time": string,
"id": string,
"on_date": string,
"player_id": string,
"status": Database["public"]['Enums']["slot_wait_status"],
"to_time": string
            }
                          SetofOptions: {
        from: "*"
        to: "slot_waits"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_tournament":
{ Args: { "p_category_max": number,"p_category_min": number,"p_court_ids": (string)[],"p_max_players": number,"p_name": string,"p_points_per_game": number,"p_price": number,"p_round_minutes": number,"p_rounds": number,"p_starts_at": string,"p_type": Database["public"]['Enums']["match_type"] }; Returns: {
              "cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_ids": (string)[],
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"max_players": number,
"name": string,
"period": unknown,
"points_per_game": number,
"price": number,
"round_minutes": number,
"rounds": number,
"starts_at": string | null,
"status": Database["public"]['Enums']["tournament_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "tournaments"
        isOneToOne: true
        isSetofReturn: false
      } },
"day_use_inside":
{ Args: { "p_club_id": string,"p_date": string }; Returns: {
              "checked_in_at": string,"name": string,"product_name": string
            }[]
                           },
"day_use_sold":
{ Args: { "p_club_id": string,"p_from": string,"p_to": string }; Returns: {
              "inside": number,"on_date": string,"product_id": string,"sold": number
            }[]
                           },
"decline_slot_hold":
{ Args: { "p_hold_id": string }; Returns: {
              "booking_id": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"ended_at": string | null,
"expires_at": string,
"id": string,
"occupancy_id": string | null,
"period": unknown,
"player_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["slot_hold_status"],
"wait_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "slot_holds"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_championship_category":
{ Args: { "p_category_id": string }; Returns: undefined
                           },
"delete_championship_window":
{ Args: { "p_window_id": string }; Returns: undefined
                           },
"end_series":
{ Args: { "p_from_date": string,"p_series_id": string }; Returns: number
                           },
"finish_notification_email":
{ Args: { "p_id": string,"p_status": Database["public"]['Enums']["email_status"] }; Returns: undefined
                           },
"finish_tournament":
{ Args: { "p_tournament_id": string }; Returns: {
              "cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_ids": (string)[],
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"max_players": number,
"name": string,
"period": unknown,
"points_per_game": number,
"price": number,
"round_minutes": number,
"rounds": number,
"starts_at": string | null,
"status": Database["public"]['Enums']["tournament_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "tournaments"
        isOneToOne: true
        isSetofReturn: false
      } },
"join_match":
{ Args: { "p_match_id": string,"p_position": number }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
        isOneToOne: true
        isSetofReturn: false
      } },
"join_tournament":
{ Args: { "p_tournament_id": string }; Returns: {
              "club_id": string,
"created_at": string,
"created_by": string | null,
"guest_name": string | null,
"id": string,
"player_id": string | null,
"removed_at": string | null,
"removed_by": string | null,
"tournament_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "tournament_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"leave_match":
{ Args: { "p_match_id": string }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
        isOneToOne: true
        isSetofReturn: false
      } },
"leave_tournament":
{ Args: { "p_tournament_id": string }; Returns: {
              "club_id": string,
"created_at": string,
"created_by": string | null,
"guest_name": string | null,
"id": string,
"player_id": string | null,
"removed_at": string | null,
"removed_by": string | null,
"tournament_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "tournament_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"mark_notifications_read":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"match_suggestions":
{ Args: { "p_match_id": string }; Returns: {
              "category": number,"display_name": string,"exact_side": boolean,"player_id": string,"prefers_court": boolean,"score": number,"side": Database["public"]['Enums']["player_side"],"spot": number,"times_played": number,"usually_free": boolean
            }[]
                           },
"member_directory":
{ Args: { "p_club_id": string }; Returns: {
              "name": string,"user_id": string
            }[]
                           },
"merge_championship_category":
{ Args: { "p_category_id": string,"p_into_id": string }; Returns: {
              "championship_id": string,
"club_id": string,
"created_at": string,
"format": Database["public"]['Enums']["championship_format"],
"gender": Database["public"]['Enums']["championship_gender"],
"group_size": number,
"id": string,
"level_max": number | null,
"level_min": number | null,
"match_minutes": number,
"match_rules": NonNullable<Json>,
"max_pairs": number,
"merged_into": string | null,
"min_pairs": number,
"name": string,
"price": number,
"qualifiers_per_group": number,
"seeding": Database["public"]['Enums']["championship_seeding"],
"sort_order": number,
"status": Database["public"]['Enums']["championship_category_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "championship_categories"
        isOneToOne: true
        isSetofReturn: false
      } },
"move_championship_entry":
{ Args: { "p_category_id": string,"p_entry_id": string }; Returns: {
              "category_id": string,
"club_id": string,
"created_at": string,
"created_by": string | null,
"ended_at": string | null,
"ended_by": string | null,
"id": string,
"note": string | null,
"player1_id": string,
"player1_level": number,
"player2_id": string,
"player2_level": number,
"seed": number | null,
"status": Database["public"]['Enums']["championship_entry_status"],
"unavailability_approved": boolean,
"unavailability_note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "championship_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"occupancy_notes":
{ Args: { "p_club_id": string,"p_from": string,"p_to": string }; Returns: {
              "id": string,"note": string
            }[]
                           },
"open_championship_registration":
{ Args: { "p_championship_id": string }; Returns: {
              "cancelled_at": string | null,
"club_id": string,
"created_at": string,
"created_by": string | null,
"draw_seed": number | null,
"id": string,
"max_categories_per_player": number,
"name": string,
"poster_path": string | null,
"public_code": string | null,
"registration_closes_at": string | null,
"registration_opens_at": string | null,
"rules": string,
"status": Database["public"]['Enums']["championship_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "championships"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_cash":
{ Args: { "p_amount": number,"p_booking_id": string,"p_payer_id"?: string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_championship_cash":
{ Args: { "p_amount": number,"p_entry_id": string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_day_use_cash":
{ Args: { "p_amount": number,"p_pass_id": string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_tournament_cash":
{ Args: { "p_amount": number,"p_entry_id": string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_tournament_score":
{ Args: { "p_game_id": string,"p_score_a": number }; Returns: {
              "a1_entry_id": string,
"a2_entry_id": string,
"b1_entry_id": string,
"b2_entry_id": string,
"club_id": string,
"court_id": string,
"id": string,
"recorded_at": string | null,
"recorded_by": string | null,
"round": number,
"score_a": number | null,
"starts_at": string,
"tournament_id": string,
"wave": number
            }
                          SetofOptions: {
        from: "*"
        to: "tournament_games"
        isOneToOne: true
        isSetofReturn: false
      } },
"refund_payment":
{ Args: { "p_payment_id": string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"register_championship_pair":
{ Args: { "p_category_id": string,"p_my_level": number,"p_partner_level": number,"p_partner_name"?: string,"p_partner_phone"?: string,"p_partner_profile_id"?: string }; Returns: {
              "category_id": string,
"club_id": string,
"created_at": string,
"created_by": string | null,
"ended_at": string | null,
"ended_by": string | null,
"id": string,
"note": string | null,
"player1_id": string,
"player1_level": number,
"player2_id": string,
"player2_level": number,
"seed": number | null,
"status": Database["public"]['Enums']["championship_entry_status"],
"unavailability_approved": boolean,
"unavailability_note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "championship_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"reject_payment":
{ Args: { "p_payment_id": string,"p_reason"?: string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"release_slot_hold":
{ Args: { "p_occupancy_id": string }; Returns: {
              "booking_id": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"ended_at": string | null,
"expires_at": string,
"id": string,
"occupancy_id": string | null,
"period": unknown,
"player_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["slot_hold_status"],
"wait_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "slot_holds"
        isOneToOne: true
        isSetofReturn: false
      } },
"remove_championship_entry":
{ Args: { "p_entry_id": string }; Returns: {
              "category_id": string,
"club_id": string,
"created_at": string,
"created_by": string | null,
"ended_at": string | null,
"ended_by": string | null,
"id": string,
"note": string | null,
"player1_id": string,
"player1_level": number,
"player2_id": string,
"player2_level": number,
"seed": number | null,
"status": Database["public"]['Enums']["championship_entry_status"],
"unavailability_approved": boolean,
"unavailability_note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "championship_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"remove_from_match":
{ Args: { "p_match_id": string,"p_player_id": string }; Returns: {
              "allow_other_court": boolean,
"booking_id": string | null,
"cancel_note": string | null,
"cancel_reason": string | null,
"cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_id": string | null,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"period": unknown,
"preferred_court_id": string,
"starts_at": string | null,
"status": Database["public"]['Enums']["match_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "open_matches"
        isOneToOne: true
        isSetofReturn: false
      } },
"remove_tournament_entry":
{ Args: { "p_entry_id": string }; Returns: {
              "club_id": string,
"created_at": string,
"created_by": string | null,
"guest_name": string | null,
"id": string,
"player_id": string | null,
"removed_at": string | null,
"removed_by": string | null,
"tournament_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "tournament_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"reopen_tournament_registration":
{ Args: { "p_tournament_id": string }; Returns: {
              "cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_ids": (string)[],
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"max_players": number,
"name": string,
"period": unknown,
"points_per_game": number,
"price": number,
"round_minutes": number,
"rounds": number,
"starts_at": string | null,
"status": Database["public"]['Enums']["tournament_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "tournaments"
        isOneToOne: true
        isSetofReturn: false
      } },
"report_championship_transfer":
{ Args: { "p_entry_id": string,"p_receipt_path"?: string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"report_day_use_transfer":
{ Args: { "p_pass_id": string,"p_receipt_path"?: string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"report_tournament_transfer":
{ Args: { "p_entry_id": string,"p_receipt_path"?: string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"report_transfer":
{ Args: { "p_booking_id": string,"p_receipt_path"?: string }; Returns: {
              "amount": number,
"booking_id": string | null,
"championship_entry_id": string | null,
"club_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"day_use_pass_id": string | null,
"id": string,
"method": Database["public"]['Enums']["payment_method"],
"payer_id": string | null,
"receipt_path": string | null,
"rejection_reason": string | null,
"reported_by": string | null,
"status": Database["public"]['Enums']["payment_status"],
"tournament_entry_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_day_use_product":
{ Args: { "p_capacity": number,"p_club_id": string,"p_court_ids": (string)[],"p_from_time": string,"p_includes": (string)[],"p_name": string,"p_price": number,"p_product_id"?: string,"p_sort_order"?: number,"p_to_time": string,"p_weekdays": (number)[] }; Returns: {
              "saved_id": string,"skipped_count": number
            }[]
                           },
"save_my_availability":
{ Args: { "p_slots": (string)[] }; Returns: {
              "band": Database["public"]['Enums']["day_band"],
"user_id": string,
"weekday": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "player_availability"
        isOneToOne: false
        isSetofReturn: true
      } },
"save_my_preferred_courts":
{ Args: { "p_club_id": string,"p_court_ids": (string)[] }; Returns: {
              "court_id": string,
"user_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "player_preferred_courts"
        isOneToOne: false
        isSetofReturn: true
      } },
"save_my_profile":
{ Args: { "p_category": number,"p_club_id": string,"p_display_name": string,"p_gender": Database["public"]['Enums']["gender"],"p_hand": Database["public"]['Enums']["dominant_hand"],"p_is_public": boolean,"p_side": Database["public"]['Enums']["player_side"] }; Returns: {
              "category": number | null,
"category_validated": boolean,
"club_id": string,
"created_at": string,
"role": Database["public"]['Enums']["club_role"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "club_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"sell_day_use":
{ Args: { "p_date": string,"p_guest_name"?: string,"p_player_id"?: string,"p_product_id": string,"p_use_reward"?: boolean }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"checked_in_at": string | null,
"checked_in_by": string | null,
"club_id": string,
"code": string,
"created_at": string,
"created_by": string | null,
"discount_percent": number,
"guest_name": string | null,
"id": string,
"on_date": string,
"player_id": string | null,
"price": number,
"product_id": string,
"source": Database["public"]['Enums']["booking_source"],
"status": Database["public"]['Enums']["day_use_pass_status"],
"total": number | null,
"used_reward": boolean
            }
                          SetofOptions: {
        from: "*"
        to: "day_use_passes"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_championship_poster":
{ Args: { "p_championship_id": string,"p_path": string }; Returns: {
              "cancelled_at": string | null,
"club_id": string,
"created_at": string,
"created_by": string | null,
"draw_seed": number | null,
"id": string,
"max_categories_per_player": number,
"name": string,
"poster_path": string | null,
"public_code": string | null,
"registration_closes_at": string | null,
"registration_opens_at": string | null,
"rules": string,
"status": Database["public"]['Enums']["championship_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "championships"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_day_use_override":
{ Args: { "p_date": string,"p_enabled": boolean,"p_product_id": string }; Returns: number
                           },
"set_day_use_product_active":
{ Args: { "p_active": boolean,"p_product_id": string }; Returns: number
                           },
"set_entry_unavailability":
{ Args: { "p_blocks": (string)[],"p_entry_id": string,"p_note"?: string }; Returns: {
              "category_id": string,
"club_id": string,
"created_at": string,
"created_by": string | null,
"ended_at": string | null,
"ended_by": string | null,
"id": string,
"note": string | null,
"player1_id": string,
"player1_level": number,
"player2_id": string,
"player2_level": number,
"seed": number | null,
"status": Database["public"]['Enums']["championship_entry_status"],
"unavailability_approved": boolean,
"unavailability_note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "championship_entries"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_member_role":
{ Args: { "p_club_id": string,"p_role": Database["public"]['Enums']["club_role"],"p_user_id": string }; Returns: {
              "category": number | null,
"category_validated": boolean,
"club_id": string,
"created_at": string,
"role": Database["public"]['Enums']["club_role"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "club_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_my_category":
{ Args: { "p_category": number,"p_club_id": string }; Returns: {
              "category": number | null,
"category_validated": boolean,
"club_id": string,
"created_at": string,
"role": Database["public"]['Enums']["club_role"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "club_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_show_in_club":
{ Args: { "p_show": boolean }; Returns: undefined
                           },
"staff_book":
{ Args: { "p_court_id": string,"p_guest_name"?: string,"p_player_id"?: string,"p_starts_at": string }; Returns: {
              "cancelled_at": string | null,
"cancelled_by": string | null,
"club_id": string,
"court_id": string,
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"guest_name": string | null,
"id": string,
"match_id": string | null,
"occupancy_id": string | null,
"period": unknown,
"player_id": string | null,
"price": number,
"series_id": string | null,
"source": Database["public"]['Enums']["booking_source"],
"starts_at": string | null,
"status": Database["public"]['Enums']["booking_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"start_tournament":
{ Args: { "p_tournament_id": string }; Returns: {
              "cancelled_at": string | null,
"category_max": number,
"category_min": number,
"club_id": string,
"court_ids": (string)[],
"created_at": string,
"created_by": string | null,
"ends_at": string | null,
"id": string,
"match_type": Database["public"]['Enums']["match_type"],
"max_players": number,
"name": string,
"period": unknown,
"points_per_game": number,
"price": number,
"round_minutes": number,
"rounds": number,
"starts_at": string | null,
"status": Database["public"]['Enums']["tournament_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "tournaments"
        isOneToOne: true
        isSetofReturn: false
      } },
"unblock":
{ Args: { "p_occupancy_id": string }; Returns: undefined
                           },
"update_championship":
{ Args: { "p_championship_id": string,"p_max_categories"?: number,"p_name": string,"p_registration_closes_at"?: string,"p_rules"?: string }; Returns: {
              "cancelled_at": string | null,
"club_id": string,
"created_at": string,
"created_by": string | null,
"draw_seed": number | null,
"id": string,
"max_categories_per_player": number,
"name": string,
"poster_path": string | null,
"public_code": string | null,
"registration_closes_at": string | null,
"registration_opens_at": string | null,
"rules": string,
"status": Database["public"]['Enums']["championship_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "championships"
        isOneToOne: true
        isSetofReturn: false
      } },
"validate_category":
{ Args: { "p_category": number,"p_club_id": string,"p_user_id": string }; Returns: {
              "category": number | null,
"category_validated": boolean,
"club_id": string,
"created_at": string,
"role": Database["public"]['Enums']["club_role"],
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "club_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"withdraw_championship_entry":
{ Args: { "p_entry_id": string }; Returns: {
              "category_id": string,
"club_id": string,
"created_at": string,
"created_by": string | null,
"ended_at": string | null,
"ended_by": string | null,
"id": string,
"note": string | null,
"player1_id": string,
"player1_level": number,
"player2_id": string,
"player2_level": number,
"seed": number | null,
"status": Database["public"]['Enums']["championship_entry_status"],
"unavailability_approved": boolean,
"unavailability_note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "championship_entries"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "booking_source": "online"|"reception","booking_status": "confirmed"|"cancelled","championship_category_status": "open"|"cancelled"|"merged","championship_entry_status": "active"|"waiting"|"withdrawn"|"removed","championship_format": "groups_knockout"|"knockout"|"round_robin","championship_gender": "men"|"women"|"mixed"|"open","championship_match_status": "scheduled"|"playing"|"finished"|"walkover","championship_seeding": "ranking"|"manual","championship_stage": "group"|"knockout","championship_status": "draft"|"registration"|"closed"|"drawn"|"published"|"in_progress"|"finished"|"cancelled","club_role": "admin"|"reception"|"player","day_band": "morning"|"afternoon"|"night","day_use_pass_status": "bought"|"inside"|"cancelled","dominant_hand": "right"|"left","email_status": "pending"|"sent"|"failed"|"skipped","gender": "male"|"female","match_status": "forming"|"confirmed"|"cancelled","match_type": "male"|"female"|"mixed","notification_kind": "slot_held"|"slot_free_now"|"championship_added"|"championship_promoted"|"championship_moved"|"championship_cancelled"|"championship_fixture","occupancy_kind": "booking"|"recurring"|"tournament"|"block"|"match"|"day_use"|"hold"|"championship","payment_method": "cash"|"transfer","payment_status": "reported"|"confirmed"|"rejected"|"refunded","player_side": "drive"|"backhand"|"both","slot_hold_status": "active"|"claimed"|"declined"|"expired"|"released","slot_wait_status": "waiting"|"booked"|"expired"|"cancelled","tournament_status": "registration"|"closed"|"in_progress"|"finished"|"cancelled"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "booking_source": ["online", "reception"],"booking_status": ["confirmed", "cancelled"],"championship_category_status": ["open", "cancelled", "merged"],"championship_entry_status": ["active", "waiting", "withdrawn", "removed"],"championship_format": ["groups_knockout", "knockout", "round_robin"],"championship_gender": ["men", "women", "mixed", "open"],"championship_match_status": ["scheduled", "playing", "finished", "walkover"],"championship_seeding": ["ranking", "manual"],"championship_stage": ["group", "knockout"],"championship_status": ["draft", "registration", "closed", "drawn", "published", "in_progress", "finished", "cancelled"],"club_role": ["admin", "reception", "player"],"day_band": ["morning", "afternoon", "night"],"day_use_pass_status": ["bought", "inside", "cancelled"],"dominant_hand": ["right", "left"],"email_status": ["pending", "sent", "failed", "skipped"],"gender": ["male", "female"],"match_status": ["forming", "confirmed", "cancelled"],"match_type": ["male", "female", "mixed"],"notification_kind": ["slot_held", "slot_free_now", "championship_added", "championship_promoted", "championship_moved", "championship_cancelled", "championship_fixture"],"occupancy_kind": ["booking", "recurring", "tournament", "block", "match", "day_use", "hold", "championship"],"payment_method": ["cash", "transfer"],"payment_status": ["reported", "confirmed", "rejected", "refunded"],"player_side": ["drive", "backhand", "both"],"slot_hold_status": ["active", "claimed", "declined", "expired", "released"],"slot_wait_status": ["waiting", "booked", "expired", "cancelled"],"tournament_status": ["registration", "closed", "in_progress", "finished", "cancelled"]
          }
        }
} as const

