export interface AppUser {
  id: string;
  username: string;
  password?: string;
  role: 'admin' | 'technician';
}

export interface Whitelist {
  id: string;
  telegram_id: string;
  name: string;
}

export interface FTM {
  id: string;
  name: string;
}

export interface GPON {
  id: string;
  name: string;
  ftm_id: string;
}

export interface FiberNode {
  id: string;
  status: 'VALID' | 'INVALID' | 'PENDING';
  lastValidatedAt: string;
  
  ftm_name: string;
  gpon_name: string;
  
  oa_rak: string;
  oa_panel: string;
  oa_port: string;
  
  ea_rak: string;
  ea_panel: string;
  ea_port: string;
  
  odc_name: string;
  odc_feeder_panel: string;
  odc_feeder_port: string;
  odc_dist_panel: string;
  odc_dist_port: string;
  
  odp_name: string;
  technician_name: string;
}

export interface ValidationEntry {
  id: string;
  ftm_name: string;
  gpon_name: string;
  oa_rak: string;
  oa_panel: string;
  oa_port: string;
  ea_rak: string;
  ea_panel: string;
  ea_port: string;
  odc_name: string;
  odc_feeder_panel: string;
  odc_feeder_port: string;
  odc_dist_panel: string;
  odc_dist_port: string;
  odp_name: string;
  technician_name: string;
  technician_id: string;
  status: string;
  created_at: any;
}
