export interface Result {
  id: number;
  comName: string;
  howMany: number;
  lat: number; 
  lng: number;
  locName: string;
  obsDt: string;
  speciesCode: string;
  subId: number;
}

export interface MapCenter {
  lat: number;
  lng: number;
}

export type Observation = {
  comName?: string;
  locName?: string;
  obsDt?: string;
  howMany?: number;
  speciesCode?: string;
};