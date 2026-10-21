
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_events": {
                  Row: {
                    "actor": string | null,"at": string,"created_at": string,"created_by": string | null,"entity_id": string | null,"entity_type": string | null,"id": string,"org_id": string,"payload": NonNullable<Json>,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor"?: string | null,"at"?: string,"created_at"?: string,"created_by"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"org_id": string,"payload"?: NonNullable<Json>,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "actor"?: string | null,"at"?: string,"created_at"?: string,"created_by"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"org_id"?: string,"payload"?: NonNullable<Json>,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"asset_bookings": {
                  Row: {
                    "asset_id": string,"booked_by": string | null,"created_at": string,"created_by": string | null,"ends_at": string,"id": string,"org_id": string,"starts_at": string,"updated_at": string,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id": string,"booked_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"id"?: string,"org_id": string,"starts_at": string,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Update: {
                    "asset_id"?: string,"booked_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"id"?: string,"org_id"?: string,"starts_at"?: string,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "asset_bookings_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_bookings_booked_by_fkey"
      columns: ["booked_by"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_bookings_booked_by_fkey"
      columns: ["booked_by"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "asset_bookings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_bookings_wo_fk"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"assets": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string | null,"id": string,"kind": string,"last_maintenance_on": string | null,"maintenance_interval_days": number,"name": string,"next_maintenance_on": string | null,"org_id": string,"site_id": string | null,"specs": NonNullable<Json>,"status": string,"technology": string | null,"updated_at": string,"zone_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"last_maintenance_on"?: string | null,"maintenance_interval_days"?: number,"name": string,"next_maintenance_on"?: string | null,"org_id": string,"site_id"?: string | null,"specs"?: NonNullable<Json>,"status"?: string,"technology"?: string | null,"updated_at"?: string,"zone_id"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"last_maintenance_on"?: string | null,"maintenance_interval_days"?: number,"name"?: string,"next_maintenance_on"?: string | null,"org_id"?: string,"site_id"?: string | null,"specs"?: NonNullable<Json>,"status"?: string,"technology"?: string | null,"updated_at"?: string,"zone_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assets_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assets_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "assets_zone_id_fkey"
      columns: ["zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor": string | null,"at": string,"id": number,"new_data": Json | null,"old_data": Json | null,"org_id": string | null,"row_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor"?: string | null,"at"?: string,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"org_id"?: string | null,"row_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"at"?: string,"id"?: never,"new_data"?: Json | null,"old_data"?: Json | null,"org_id"?: string | null,"row_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"badge_events": {
                  Row: {
                    "at": string,"created_at": string,"created_by": string | null,"employee_id": string,"id": string,"kind": string,"org_id": string,"reader": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"created_at"?: string,"created_by"?: string | null,"employee_id": string,"id"?: string,"kind": string,"org_id": string,"reader"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "at"?: string,"created_at"?: string,"created_by"?: string | null,"employee_id"?: string,"id"?: string,"kind"?: string,"org_id"?: string,"reader"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "badge_events_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "badge_events_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "badge_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"calendar_events": {
                  Row: {
                    "asset_id": string | null,"client_id": string | null,"created_at": string,"created_by": string | null,"ends_at": string,"external_id": string | null,"external_source": string | null,"id": string,"kind": string,"org_id": string,"owner_employee_id": string | null,"participants": (string)[],"room_asset_id": string | null,"starts_at": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id"?: string | null,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at": string,"external_id"?: string | null,"external_source"?: string | null,"id"?: string,"kind": string,"org_id": string,"owner_employee_id"?: string | null,"participants"?: (string)[],"room_asset_id"?: string | null,"starts_at": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "asset_id"?: string | null,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"ends_at"?: string,"external_id"?: string | null,"external_source"?: string | null,"id"?: string,"kind"?: string,"org_id"?: string,"owner_employee_id"?: string | null,"participants"?: (string)[],"room_asset_id"?: string | null,"starts_at"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_events_owner_employee_id_fkey"
      columns: ["owner_employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_events_owner_employee_id_fkey"
      columns: ["owner_employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    }
                  ]
                },"candidates": {
                  Row: {
                    "ai_summary": string | null,"created_at": string,"created_by": string | null,"email": string | null,"full_name": string,"id": string,"job_opening_id": string | null,"notes": string | null,"org_id": string,"phone": string | null,"score": string | null,"source": string | null,"stage": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_summary"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name": string,"id"?: string,"job_opening_id"?: string | null,"notes"?: string | null,"org_id": string,"phone"?: string | null,"score"?: string | null,"source"?: string | null,"stage"?: string,"updated_at"?: string
                  }
                  Update: {
                    "ai_summary"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"job_opening_id"?: string | null,"notes"?: string | null,"org_id"?: string,"phone"?: string | null,"score"?: string | null,"source"?: string | null,"stage"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "candidates_job_opening_id_fkey"
      columns: ["job_opening_id"]
isOneToOne: false
      referencedRelation: "job_openings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "candidates_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"cash_forecast": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"inflow": number,"month": string,"note": string | null,"org_id": string,"outflow": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"inflow"?: number,"month": string,"note"?: string | null,"org_id": string,"outflow"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"inflow"?: number,"month"?: string,"note"?: string | null,"org_id"?: string,"outflow"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cash_forecast_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_items": {
                  Row: {
                    "category": string | null,"created_at": string,"created_by": string | null,"id": string,"label": string,"org_id": string,"sku": string,"technology": string | null,"unit": string,"unit_cost": number,"unit_price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"label": string,"org_id": string,"sku": string,"technology"?: string | null,"unit"?: string,"unit_cost": number,"unit_price": number,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"label"?: string,"org_id"?: string,"sku"?: string,"technology"?: string | null,"unit"?: string,"unit_cost"?: number,"unit_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"checklists": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"items": NonNullable<Json>,"org_id": string,"title": string,"updated_at": string,"work_order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"items"?: NonNullable<Json>,"org_id": string,"title": string,"updated_at"?: string,"work_order_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"items"?: NonNullable<Json>,"org_id"?: string,"title"?: string,"updated_at"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checklists_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checklists_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "address": string | null,"city": string | null,"country": string | null,"created_at": string,"created_by": string | null,"id": string,"industry": string | null,"name": string,"notes": string | null,"org_id": string,"owner_employee_id": string | null,"payment_terms_days": number,"product_family": string | null,"status": string,"updated_at": string,"vat_number": string | null,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"city"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"industry"?: string | null,"name": string,"notes"?: string | null,"org_id": string,"owner_employee_id"?: string | null,"payment_terms_days"?: number,"product_family"?: string | null,"status"?: string,"updated_at"?: string,"vat_number"?: string | null,"website"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"city"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"industry"?: string | null,"name"?: string,"notes"?: string | null,"org_id"?: string,"owner_employee_id"?: string | null,"payment_terms_days"?: number,"product_family"?: string | null,"status"?: string,"updated_at"?: string,"vat_number"?: string | null,"website"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_owner_employee_id_fkey"
      columns: ["owner_employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_owner_employee_id_fkey"
      columns: ["owner_employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    }
                  ]
                },"contacts": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string | null,"email": string | null,"first_name": string,"id": string,"is_primary": boolean,"job_title": string | null,"last_name": string,"org_id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"first_name": string,"id"?: string,"is_primary"?: boolean,"job_title"?: string | null,"last_name": string,"org_id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"first_name"?: string,"id"?: string,"is_primary"?: boolean,"job_title"?: string | null,"last_name"?: string,"org_id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contacts_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"deals": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string | null,"expected_close": string | null,"id": string,"lost_reason": string | null,"next_step": string | null,"next_step_on": string | null,"org_id": string,"owner_employee_id": string | null,"probability": number,"product_family": string | null,"stage": string,"title": string,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by"?: string | null,"expected_close"?: string | null,"id"?: string,"lost_reason"?: string | null,"next_step"?: string | null,"next_step_on"?: string | null,"org_id": string,"owner_employee_id"?: string | null,"probability"?: number,"product_family"?: string | null,"stage": string,"title": string,"updated_at"?: string,"value"?: number
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string | null,"expected_close"?: string | null,"id"?: string,"lost_reason"?: string | null,"next_step"?: string | null,"next_step_on"?: string | null,"org_id"?: string,"owner_employee_id"?: string | null,"probability"?: number,"product_family"?: string | null,"stage"?: string,"title"?: string,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "deals_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deals_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deals_owner_employee_id_fkey"
      columns: ["owner_employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deals_owner_employee_id_fkey"
      columns: ["owner_employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "created_at": string,"created_by": string | null,"entity_id": string | null,"entity_type": string | null,"id": string,"mime": string | null,"name": string,"org_id": string,"size_bytes": number | null,"storage_path": string,"updated_at": string,"uploaded_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"mime"?: string | null,"name": string,"org_id": string,"size_bytes"?: number | null,"storage_path": string,"updated_at"?: string,"uploaded_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"mime"?: string | null,"name"?: string,"org_id"?: string,"size_bytes"?: number | null,"storage_path"?: string,"updated_at"?: string,"uploaded_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"dunning_steps": {
                  Row: {
                    "channel": string,"created_at": string,"created_by": string | null,"id": string,"invoice_id": string,"level": number,"note": string | null,"org_id": string,"sent_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invoice_id": string,"level": number,"note"?: string | null,"org_id": string,"sent_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "channel"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invoice_id"?: string,"level"?: number,"note"?: string | null,"org_id"?: string,"sent_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dunning_steps_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dunning_steps_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"employee_salaries": {
                  Row: {
                    "bonus": number,"created_at": string,"created_by": string | null,"effective_from": string,"effective_to": string | null,"employee_id": string,"gross_annual": number,"id": string,"months_count": number,"org_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bonus"?: number,"created_at"?: string,"created_by"?: string | null,"effective_from": string,"effective_to"?: string | null,"employee_id": string,"gross_annual": number,"id"?: string,"months_count": number,"org_id": string,"updated_at"?: string
                  }
                  Update: {
                    "bonus"?: number,"created_at"?: string,"created_by"?: string | null,"effective_from"?: string,"effective_to"?: string | null,"employee_id"?: string,"gross_annual"?: number,"id"?: string,"months_count"?: number,"org_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "employee_salaries_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employee_salaries_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "employee_salaries_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"employees": {
                  Row: {
                    "active": boolean,"appearance": NonNullable<Json>,"avatar_color": string | null,"contract_type": string,"created_at": string,"created_by": string | null,"department": string | null,"email": string | null,"first_name": string,"home_zone_id": string | null,"id": string,"job_title": string,"last_name": string,"leave_carryover": number,"manager_id": string | null,"org_id": string,"phone": string | null,"role_key": string | null,"site_id": string | null,"skills": (string)[],"start_date": string | null,"updated_at": string,"weekly_hours": number,"work_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"appearance"?: NonNullable<Json>,"avatar_color"?: string | null,"contract_type"?: string,"created_at"?: string,"created_by"?: string | null,"department"?: string | null,"email"?: string | null,"first_name": string,"home_zone_id"?: string | null,"id"?: string,"job_title": string,"last_name": string,"leave_carryover"?: number,"manager_id"?: string | null,"org_id": string,"phone"?: string | null,"role_key"?: string | null,"site_id"?: string | null,"skills"?: (string)[],"start_date"?: string | null,"updated_at"?: string,"weekly_hours"?: number,"work_rate"?: number
                  }
                  Update: {
                    "active"?: boolean,"appearance"?: NonNullable<Json>,"avatar_color"?: string | null,"contract_type"?: string,"created_at"?: string,"created_by"?: string | null,"department"?: string | null,"email"?: string | null,"first_name"?: string,"home_zone_id"?: string | null,"id"?: string,"job_title"?: string,"last_name"?: string,"leave_carryover"?: number,"manager_id"?: string | null,"org_id"?: string,"phone"?: string | null,"role_key"?: string | null,"site_id"?: string | null,"skills"?: (string)[],"start_date"?: string | null,"updated_at"?: string,"weekly_hours"?: number,"work_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "employees_home_zone_id_fkey"
      columns: ["home_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_manager_id_fkey"
      columns: ["manager_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_manager_id_fkey"
      columns: ["manager_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "employees_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"approver_id": string | null,"category": string | null,"created_at": string,"created_by": string | null,"employee_id": string,"id": string,"label": string,"org_id": string,"receipt_path": string | null,"spent_on": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"approver_id"?: string | null,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"employee_id": string,"id"?: string,"label": string,"org_id": string,"receipt_path"?: string | null,"spent_on": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"approver_id"?: string | null,"category"?: string | null,"created_at"?: string,"created_by"?: string | null,"employee_id"?: string,"id"?: string,"label"?: string,"org_id"?: string,"receipt_path"?: string | null,"spent_on"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "expenses_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "expenses_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"floor_plans": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"layout": NonNullable<Json>,"org_id": string,"site_id": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"layout"?: NonNullable<Json>,"org_id": string,"site_id": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"layout"?: NonNullable<Json>,"org_id"?: string,"site_id"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "floor_plans_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "floor_plans_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_lines": {
                  Row: {
                    "catalog_item_id": string | null,"created_at": string,"created_by": string | null,"description": string,"discount": number,"id": string,"invoice_id": string,"org_id": string,"position": number,"quantity": number,"unit_price": number,"updated_at": string,"vat_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "catalog_item_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description": string,"discount"?: number,"id"?: string,"invoice_id": string,"org_id": string,"position"?: number,"quantity": number,"unit_price": number,"updated_at"?: string,"vat_rate": number
                  }
                  Update: {
                    "catalog_item_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"discount"?: number,"id"?: string,"invoice_id"?: string,"org_id"?: string,"position"?: number,"quantity"?: number,"unit_price"?: number,"updated_at"?: string,"vat_rate"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_lines_catalog_item_id_fkey"
      columns: ["catalog_item_id"]
isOneToOne: false
      referencedRelation: "catalog_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_lines_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_lines_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "client_id": string,"contact_id": string | null,"created_at": string,"created_by": string | null,"due_date": string,"id": string,"issue_date": string,"kind": string,"notes": string | null,"number": string,"org_id": string,"paid_amount": number,"quote_id": string | null,"sent_at": string | null,"status": string,"total_ht": number,"total_ttc": number,"total_vat": number,"updated_at": string,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "client_id": string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_date": string,"id"?: string,"issue_date"?: string,"kind"?: string,"notes"?: string | null,"number": string,"org_id": string,"paid_amount"?: number,"quote_id"?: string | null,"sent_at"?: string | null,"status"?: string,"total_ht"?: number,"total_ttc"?: number,"total_vat"?: number,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Update: {
                    "client_id"?: string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_date"?: string,"id"?: string,"issue_date"?: string,"kind"?: string,"notes"?: string | null,"number"?: string,"org_id"?: string,"paid_amount"?: number,"quote_id"?: string | null,"sent_at"?: string | null,"status"?: string,"total_ht"?: number,"total_ttc"?: number,"total_vat"?: number,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"job_openings": {
                  Row: {
                    "created_at": string,"created_by": string | null,"department": string | null,"description": string | null,"id": string,"org_id": string,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"department"?: string | null,"description"?: string | null,"id"?: string,"org_id": string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"department"?: string | null,"description"?: string | null,"id"?: string,"org_id"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_openings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_requests": {
                  Row: {
                    "approver_id": string | null,"comment": string | null,"created_at": string,"created_by": string | null,"days": number,"decided_at": string | null,"employee_id": string,"ends_on": string,"id": string,"kind": string,"org_id": string,"rejection_reason": string | null,"starts_on": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approver_id"?: string | null,"comment"?: string | null,"created_at"?: string,"created_by"?: string | null,"days": number,"decided_at"?: string | null,"employee_id": string,"ends_on": string,"id"?: string,"kind": string,"org_id": string,"rejection_reason"?: string | null,"starts_on": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "approver_id"?: string | null,"comment"?: string | null,"created_at"?: string,"created_by"?: string | null,"days"?: number,"decided_at"?: string | null,"employee_id"?: string,"ends_on"?: string,"id"?: string,"kind"?: string,"org_id"?: string,"rejection_reason"?: string | null,"starts_on"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_approver_id_fkey"
      columns: ["approver_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "leave_requests_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "leave_requests_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"map_objects": {
                  Row: {
                    "created_at": string,"created_by": string | null,"entity_id": string | null,"entity_type": string | null,"id": string,"kit": string,"org_id": string,"position": NonNullable<Json>,"rotation": number,"scale": number,"site_id": string,"type": string,"updated_at": string,"visual_state": string,"zone_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"kit": string,"org_id": string,"position"?: NonNullable<Json>,"rotation"?: number,"scale"?: number,"site_id": string,"type": string,"updated_at"?: string,"visual_state"?: string,"zone_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"kit"?: string,"org_id"?: string,"position"?: NonNullable<Json>,"rotation"?: number,"scale"?: number,"site_id"?: string,"type"?: string,"updated_at"?: string,"visual_state"?: string,"zone_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "map_objects_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "map_objects_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "map_objects_zone_id_fkey"
      columns: ["zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "ai_draft": boolean,"author": string,"body": string,"created_at": string,"created_by": string | null,"direction": string,"id": string,"org_id": string,"sent_at": string | null,"thread_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_draft"?: boolean,"author": string,"body": string,"created_at"?: string,"created_by"?: string | null,"direction": string,"id"?: string,"org_id": string,"sent_at"?: string | null,"thread_id": string,"updated_at"?: string
                  }
                  Update: {
                    "ai_draft"?: boolean,"author"?: string,"body"?: string,"created_at"?: string,"created_by"?: string | null,"direction"?: string,"id"?: string,"org_id"?: string,"sent_at"?: string | null,"thread_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "thread_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "threads"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"created_by": string | null,"id": string,"link": string | null,"org_id": string,"read_at": string | null,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"link"?: string | null,"org_id": string,"read_at"?: string | null,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"link"?: string | null,"org_id"?: string,"read_at"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"onboarding_tasks": {
                  Row: {
                    "created_at": string,"created_by": string | null,"done": boolean,"due_on": string | null,"employee_id": string,"id": string,"org_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"done"?: boolean,"due_on"?: string | null,"employee_id": string,"id"?: string,"org_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"done"?: boolean,"due_on"?: string | null,"employee_id"?: string,"id"?: string,"org_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "onboarding_tasks_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "onboarding_tasks_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "onboarding_tasks_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"orgs": {
                  Row: {
                    "accent_color": string | null,"created_at": string,"created_by": string | null,"currency": string,"id": string,"locale": string,"name": string,"rounding": number,"slug": string,"timezone": string,"updated_at": string,"vat_rate": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accent_color"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"locale"?: string,"name": string,"rounding"?: number,"slug": string,"timezone"?: string,"updated_at"?: string,"vat_rate"?: number
                  }
                  Update: {
                    "accent_color"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"id"?: string,"locale"?: string,"name"?: string,"rounding"?: number,"slug"?: string,"timezone"?: string,"updated_at"?: string,"vat_rate"?: number
                  }
                  Relationships: [
                    
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"id": string,"invoice_id": string,"method": string,"org_id": string,"paid_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invoice_id": string,"method"?: string,"org_id": string,"paid_on": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invoice_id"?: string,"method"?: string,"org_id"?: string,"paid_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "action": string,"created_at": string,"created_by": string | null,"id": string,"module": string,"org_id": string,"role_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"module": string,"org_id": string,"role_id": string,"updated_at"?: string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"module"?: string,"org_id"?: string,"role_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "permissions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"created_by": string | null,"employee_id": string | null,"full_name": string,"locale": string,"org_id": string,"role_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"employee_id"?: string | null,"full_name": string,"locale"?: string,"org_id": string,"role_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"employee_id"?: string | null,"full_name"?: string,"locale"?: string,"org_id"?: string,"role_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_employee_fk"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_employee_fk"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "profiles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_orders": {
                  Row: {
                    "created_at": string,"created_by": string | null,"expected_on": string | null,"id": string,"lines": NonNullable<Json>,"notes": string | null,"number": string,"org_id": string,"received_at": string | null,"sent_at": string | null,"status": string,"supplier_id": string,"total": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"expected_on"?: string | null,"id"?: string,"lines"?: NonNullable<Json>,"notes"?: string | null,"number": string,"org_id": string,"received_at"?: string | null,"sent_at"?: string | null,"status"?: string,"supplier_id": string,"total"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"expected_on"?: string | null,"id"?: string,"lines"?: NonNullable<Json>,"notes"?: string | null,"number"?: string,"org_id"?: string,"received_at"?: string | null,"sent_at"?: string | null,"status"?: string,"supplier_id"?: string,"total"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_orders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"quote_lines": {
                  Row: {
                    "catalog_item_id": string | null,"created_at": string,"created_by": string | null,"description": string,"discount": number,"id": string,"org_id": string,"position": number,"quantity": number,"quote_id": string,"unit_cost": number,"unit_price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "catalog_item_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description": string,"discount"?: number,"id"?: string,"org_id": string,"position"?: number,"quantity": number,"quote_id": string,"unit_cost"?: number,"unit_price": number,"updated_at"?: string
                  }
                  Update: {
                    "catalog_item_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"discount"?: number,"id"?: string,"org_id"?: string,"position"?: number,"quantity"?: number,"quote_id"?: string,"unit_cost"?: number,"unit_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_lines_catalog_item_id_fkey"
      columns: ["catalog_item_id"]
isOneToOne: false
      referencedRelation: "catalog_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_lines_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quote_lines_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    }
                  ]
                },"quotes": {
                  Row: {
                    "accepted_at": string | null,"client_id": string,"contact_id": string | null,"created_at": string,"created_by": string | null,"deal_id": string | null,"followups": number,"id": string,"issue_date": string,"last_followup_at": string | null,"notes": string | null,"number": string,"org_id": string,"rejected_reason": string | null,"sent_at": string | null,"status": string,"total_cost": number,"total_ht": number,"total_ttc": number,"total_vat": number,"updated_at": string,"valid_until": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"client_id": string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"followups"?: number,"id"?: string,"issue_date"?: string,"last_followup_at"?: string | null,"notes"?: string | null,"number": string,"org_id": string,"rejected_reason"?: string | null,"sent_at"?: string | null,"status"?: string,"total_cost"?: number,"total_ht"?: number,"total_ttc"?: number,"total_vat"?: number,"updated_at"?: string,"valid_until"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"client_id"?: string,"contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"followups"?: number,"id"?: string,"issue_date"?: string,"last_followup_at"?: string | null,"notes"?: string | null,"number"?: string,"org_id"?: string,"rejected_reason"?: string | null,"sent_at"?: string | null,"status"?: string,"total_cost"?: number,"total_ht"?: number,"total_ttc"?: number,"total_vat"?: number,"updated_at"?: string,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "created_at": string,"created_by": string | null,"employee_id": string,"id": string,"notes": string | null,"objectives": NonNullable<Json>,"org_id": string,"rating": number | null,"review_date": string,"reviewer_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"employee_id": string,"id"?: string,"notes"?: string | null,"objectives"?: NonNullable<Json>,"org_id": string,"rating"?: number | null,"review_date": string,"reviewer_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"employee_id"?: string,"id"?: string,"notes"?: string | null,"objectives"?: NonNullable<Json>,"org_id"?: string,"rating"?: number | null,"review_date"?: string,"reviewer_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "reviews_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "can_see_salaries": boolean,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"key": string,"label": string,"org_id": string,"read_only": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_see_salaries"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"key": string,"label": string,"org_id": string,"read_only"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "can_see_salaries"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"key"?: string,"label"?: string,"org_id"?: string,"read_only"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"sites": {
                  Row: {
                    "address": string | null,"created_at": string,"created_by": string | null,"id": string,"key": string,"name": string,"org_id": string,"shape": string | null,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"key": string,"name": string,"org_id": string,"shape"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"key"?: string,"name"?: string,"org_id"?: string,"shape"?: string | null,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_items": {
                  Row: {
                    "category": string,"created_at": string,"created_by": string | null,"hazardous": boolean,"id": string,"label": string,"location_zone_id": string | null,"min_quantity": number,"org_id": string,"pack_size": number,"quantity": number,"sku": string,"supplier_id": string | null,"unit": string,"unit_cost": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"created_by"?: string | null,"hazardous"?: boolean,"id"?: string,"label": string,"location_zone_id"?: string | null,"min_quantity"?: number,"org_id": string,"pack_size"?: number,"quantity"?: number,"sku": string,"supplier_id"?: string | null,"unit": string,"unit_cost"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"created_by"?: string | null,"hazardous"?: boolean,"id"?: string,"label"?: string,"location_zone_id"?: string | null,"min_quantity"?: number,"org_id"?: string,"pack_size"?: number,"quantity"?: number,"sku"?: string,"supplier_id"?: string | null,"unit"?: string,"unit_cost"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_items_location_zone_id_fkey"
      columns: ["location_zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_items_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "at": string,"created_at": string,"created_by": string | null,"delta": number,"id": string,"org_id": string,"reason": string,"stock_item_id": string,"updated_at": string,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"created_at"?: string,"created_by"?: string | null,"delta": number,"id"?: string,"org_id": string,"reason": string,"stock_item_id": string,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Update: {
                    "at"?: string,"created_at"?: string,"created_by"?: string | null,"delta"?: number,"id"?: string,"org_id"?: string,"reason"?: string,"stock_item_id"?: string,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_stock_item_id_fkey"
      columns: ["stock_item_id"]
isOneToOne: false
      referencedRelation: "stock_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "category": string | null,"created_at": string,"created_by": string | null,"email": string | null,"id": string,"lead_time_days": number | null,"name": string,"org_id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"lead_time_days"?: number | null,"name": string,"org_id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"lead_time_days"?: number | null,"name"?: string,"org_id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suppliers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "assignee_employee_id": string | null,"created_at": string,"created_by": string | null,"due_on": string | null,"id": string,"org_id": string,"position": number,"status": string,"title": string,"updated_at": string,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_employee_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_on"?: string | null,"id"?: string,"org_id": string,"position"?: number,"status"?: string,"title": string,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Update: {
                    "assignee_employee_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_on"?: string | null,"id"?: string,"org_id"?: string,"position"?: number,"status"?: string,"title"?: string,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_employee_id_fkey"
      columns: ["assignee_employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_assignee_employee_id_fkey"
      columns: ["assignee_employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "tasks_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"threads": {
                  Row: {
                    "assigned_employee": string | null,"channel": string,"client_id": string | null,"created_at": string,"created_by": string | null,"created_by_employee": string | null,"id": string,"last_message_at": string,"org_id": string,"read_at": string | null,"subject": string,"supplier_id": string | null,"updated_at": string,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_employee"?: string | null,"channel": string,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"created_by_employee"?: string | null,"id"?: string,"last_message_at"?: string,"org_id": string,"read_at"?: string | null,"subject": string,"supplier_id"?: string | null,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Update: {
                    "assigned_employee"?: string | null,"channel"?: string,"client_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"created_by_employee"?: string | null,"id"?: string,"last_message_at"?: string,"org_id"?: string,"read_at"?: string | null,"subject"?: string,"supplier_id"?: string | null,"updated_at"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "threads_assigned_employee_fkey"
      columns: ["assigned_employee"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_assigned_employee_fkey"
      columns: ["assigned_employee"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "threads_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_created_by_employee_fkey"
      columns: ["created_by_employee"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_created_by_employee_fkey"
      columns: ["created_by_employee"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "threads_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"time_entries": {
                  Row: {
                    "billable": boolean,"created_at": string,"created_by": string | null,"employee_id": string,"hours": number,"id": string,"note": string | null,"org_id": string,"updated_at": string,"work_date": string,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "billable"?: boolean,"created_at"?: string,"created_by"?: string | null,"employee_id": string,"hours": number,"id"?: string,"note"?: string | null,"org_id": string,"updated_at"?: string,"work_date": string,"work_order_id"?: string | null
                  }
                  Update: {
                    "billable"?: boolean,"created_at"?: string,"created_by"?: string | null,"employee_id"?: string,"hours"?: number,"id"?: string,"note"?: string | null,"org_id"?: string,"updated_at"?: string,"work_date"?: string,"work_order_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_entries_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "time_entries_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "time_entries_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"trainings": {
                  Row: {
                    "created_at": string,"created_by": string | null,"employee_id": string,"expires_on": string | null,"id": string,"org_id": string,"provider": string | null,"scheduled_on": string | null,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"employee_id": string,"expires_on"?: string | null,"id"?: string,"org_id": string,"provider"?: string | null,"scheduled_on"?: string | null,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"employee_id"?: string,"expires_on"?: string | null,"id"?: string,"org_id"?: string,"provider"?: string | null,"scheduled_on"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trainings_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trainings_employee_id_fkey"
      columns: ["employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "trainings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"work_order_stages": {
                  Row: {
                    "actor_employee_id": string | null,"created_at": string,"created_by": string | null,"entered_at": string,"id": string,"left_at": string | null,"note": string | null,"org_id": string,"stage": string,"updated_at": string,"work_order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_employee_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"entered_at"?: string,"id"?: string,"left_at"?: string | null,"note"?: string | null,"org_id": string,"stage": string,"updated_at"?: string,"work_order_id": string
                  }
                  Update: {
                    "actor_employee_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"entered_at"?: string,"id"?: string,"left_at"?: string | null,"note"?: string | null,"org_id"?: string,"stage"?: string,"updated_at"?: string,"work_order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_order_stages_actor_employee_id_fkey"
      columns: ["actor_employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_order_stages_actor_employee_id_fkey"
      columns: ["actor_employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "work_order_stages_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_order_stages_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"work_orders": {
                  Row: {
                    "asset_id": string | null,"client_id": string,"created_at": string,"created_by": string | null,"due_date": string | null,"hours_budget": number,"id": string,"number": string,"org_id": string,"owner_employee_id": string | null,"physical_object": string | null,"priority": string,"product_family": string | null,"progress": number,"quote_id": string | null,"site_id": string | null,"stage": string,"stage_progress": number,"status": string,"technology": string | null,"title": string,"traceability": NonNullable<Json>,"updated_at": string,"zone_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id"?: string | null,"client_id": string,"created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"hours_budget"?: number,"id"?: string,"number": string,"org_id": string,"owner_employee_id"?: string | null,"physical_object"?: string | null,"priority"?: string,"product_family"?: string | null,"progress"?: number,"quote_id"?: string | null,"site_id"?: string | null,"stage": string,"stage_progress"?: number,"status"?: string,"technology"?: string | null,"title": string,"traceability"?: NonNullable<Json>,"updated_at"?: string,"zone_id"?: string | null
                  }
                  Update: {
                    "asset_id"?: string | null,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"hours_budget"?: number,"id"?: string,"number"?: string,"org_id"?: string,"owner_employee_id"?: string | null,"physical_object"?: string | null,"priority"?: string,"product_family"?: string | null,"progress"?: number,"quote_id"?: string | null,"site_id"?: string | null,"stage"?: string,"stage_progress"?: number,"status"?: string,"technology"?: string | null,"title"?: string,"traceability"?: NonNullable<Json>,"updated_at"?: string,"zone_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_orders_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_owner_employee_id_fkey"
      columns: ["owner_employee_id"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_owner_employee_id_fkey"
      columns: ["owner_employee_id"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "work_orders_quote_id_fkey"
      columns: ["quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_zone_id_fkey"
      columns: ["zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    }
                  ]
                },"zones": {
                  Row: {
                    "capacity": number | null,"created_at": string,"created_by": string | null,"id": string,"key": string,"name": string,"org_id": string,"outdoor": boolean,"polygon": NonNullable<Json>,"restricted": boolean,"site_id": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"key": string,"name": string,"org_id": string,"outdoor"?: boolean,"polygon"?: NonNullable<Json>,"restricted"?: boolean,"site_id": string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "capacity"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"key"?: string,"name"?: string,"org_id"?: string,"outdoor"?: boolean,"polygon"?: NonNullable<Json>,"restricted"?: boolean,"site_id"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "zones_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "zones_site_id_fkey"
      columns: ["site_id"]
isOneToOne: false
      referencedRelation: "sites"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "audit_entries": {
                  Row: {
                    "action": string | null,"actor": string | null,"actor_name": string | null,"at": string | null,"id": number | null,"new_data": Json | null,"old_data": Json | null,"org_id": string | null,"row_id": string | null,"table_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "action"?: string | null,"actor"?: string | null,"actor_name"?: never,"at"?: string | null,"id"?: number | null,"new_data"?: Json | null,"old_data"?: Json | null,"org_id"?: string | null,"row_id"?: string | null,"table_name"?: string | null
                         }
                        Update: {
                           "action"?: string | null,"actor"?: string | null,"actor_name"?: never,"at"?: string | null,"id"?: number | null,"new_data"?: Json | null,"old_data"?: Json | null,"org_id"?: string | null,"row_id"?: string | null,"table_name"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"presence_status": {
                  Row: {
                    "current_activity": string | null,"employee_id": string | null,"org_id": string | null,"since": string | null,"status": string | null,"zone_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "employees_home_zone_id_fkey"
      columns: ["zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "employees_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"thread_overview": {
                  Row: {
                    "assigned_employee": string | null,"channel": string | null,"client_id": string | null,"created_by_employee": string | null,"drafts": number | null,"id": string | null,"last_body": string | null,"last_direction": string | null,"last_inbound_at": string | null,"last_message_at": string | null,"org_id": string | null,"read_at": string | null,"subject": string | null,"supplier_id": string | null,"work_order_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "assigned_employee"?: string | null,"channel"?: string | null,"client_id"?: string | null,"created_by_employee"?: string | null,"drafts"?: never,"id"?: string | null,"last_body"?: never,"last_direction"?: never,"last_inbound_at"?: never,"last_message_at"?: string | null,"org_id"?: string | null,"read_at"?: string | null,"subject"?: string | null,"supplier_id"?: string | null,"work_order_id"?: string | null
                         }
                        Update: {
                           "assigned_employee"?: string | null,"channel"?: string | null,"client_id"?: string | null,"created_by_employee"?: string | null,"drafts"?: never,"id"?: string | null,"last_body"?: never,"last_direction"?: never,"last_inbound_at"?: never,"last_message_at"?: string | null,"org_id"?: string | null,"read_at"?: string | null,"subject"?: string | null,"supplier_id"?: string | null,"work_order_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "threads_assigned_employee_fkey"
      columns: ["assigned_employee"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_assigned_employee_fkey"
      columns: ["assigned_employee"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "threads_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_created_by_employee_fkey"
      columns: ["created_by_employee"]
isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_created_by_employee_fkey"
      columns: ["created_by_employee"]
isOneToOne: false
      referencedRelation: "presence_status"
      referencedColumns: ["employee_id"]
    },{
      foreignKeyName: "threads_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_work_order_id_fkey"
      columns: ["work_order_id"]
isOneToOne: false
      referencedRelation: "work_orders"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_quote":
{ Args: { "p_progress": number,"p_quote": string,"p_site_key": string,"p_stage": string,"p_technology": string,"p_wo_prefix": string,"p_zone_key": string }; Returns: Json
                           },
"my_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"next_document_number":
{ Args: { "p_prefix": string,"p_table": string }; Returns: string
                           },
"notify_employee":
{ Args: { "p_body": string,"p_employee": string,"p_link": string,"p_title": string }; Returns: number
                           },
"org_members":
{ Args: Record<PropertyKey, never>; Returns: {
              "full_name": string,"user_id": string
            }[]
                           },
"receive_purchase_order":
{ Args: { "p_po": string }; Returns: Json
                           },
"refresh_overdue_invoices":
{ Args: Record<PropertyKey, never>; Returns: number
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
