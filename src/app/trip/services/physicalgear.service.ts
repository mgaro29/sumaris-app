import {Injectable, InjectionToken} from "@angular/core";
import {BaseDataService} from "../../core/services/base.data-service.class";
import {LoadResult, TableDataService} from "../../shared/services/data-service.class";
import {PhysicalGear, Trip} from "./model/trip.model";
import {GraphqlService} from "../../core/services/graphql.service";
import {NetworkService} from "../../core/services/network.service";
import {AccountService} from "../../core/services/account.service";
import {EntityStorage} from "../../core/services/entities-storage.service";
import {environment} from "../../../environments/environment";
import {Moment} from "moment";
import {EMPTY, Observable} from "rxjs";
import {fromDateISOString, isNil} from "../../shared/functions";
import {filter, map, throttleTime} from "rxjs/operators";
import {TripFilter} from "./trip.service";
import {ErrorCodes} from "./trip.errors";
import gql from "graphql-tag";
import {PhysicalGearFragments} from "./trip.queries";
import {ReferentialFragments} from "../../referential/services/referential.queries";


export class PhysicalGearFilter {
  tripId?: number;
  vesselId?: number;
  programLabel?: string;
  startDate?: Moment;
  endDate?: Moment;
  excludeTripId?: number;
}


const LoadAllQuery: any = gql`
  query PhysicalGears($filter: PhysicalGearFilterVOInput, $offset: Int, $size: Int, $sortBy: String, $sortDirection: String){
    physicalGears(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...PhysicalGearFragment
      trip {
        departureDateTime
        returnDateTime
      }
    }
  }
  ${PhysicalGearFragments.physicalGear}
  ${ReferentialFragments.referential}
  ${ReferentialFragments.lightDepartment}
`;


const sortByTripDateFn = (n1: PhysicalGear, n2: PhysicalGear) => {
  const d1 = n1.trip && (n1.trip.returnDateTime || n1.trip.departureDateTime);
  const d2 = n2.trip && (n2.trip.returnDateTime || n2.trip.departureDateTime);
  return d1.isSame(d2) ? 0 : (d1.isAfter(d2) ? 1 : -1);
};

export const PHYSICAL_GEAR_DATA_SERVICE = new InjectionToken<TableDataService<PhysicalGear, PhysicalGearFilter>>('PhysicalGearDataService');


@Injectable({providedIn: 'root'})
export class PhysicalGearService extends BaseDataService
  implements TableDataService<PhysicalGear, PhysicalGearFilter> {

  loading = false;

  constructor(
    protected graphql: GraphqlService,
    protected network: NetworkService,
    protected accountService: AccountService,
    protected entities: EntityStorage
  ) {
    super(graphql);

    // -- For DEV only
    this._debug = !environment.production;
  }

  watchAll(
    offset: number,
    size: number,
    sortBy?: string,
    sortDirection?: string,
    dataFilter?: PhysicalGearFilter,
    options?: any
  ): Observable<LoadResult<PhysicalGear>> {
    if (!dataFilter || isNil(dataFilter.vesselId)) {
      console.warn("[physical-gear-service] Trying to load gears without 'filter.vesselId'. Skipping.");
      return EMPTY;
    }

    const variables: any = {
      offset: offset || 0,
      size: size || 1000,
      sortBy: (sortBy !== 'id' && sortBy) || 'rankOrder',
      sortDirection: sortDirection || 'desc'
    };

    let $loadResult: Observable<{ physicalGears?: PhysicalGear[] }>;
    let now = this._debug && Date.now();

    const offlineData = this.network.offline || (dataFilter && dataFilter.tripId < 0) || false;
    if (offlineData) {
      if (this._debug) console.debug("[physical-gear-service] Loading physical gears locally... using options:", variables);
      $loadResult = this.entities.watchAll<Trip>('TripVO', {
        ...variables,
        filter: TripFilter.searchFilter<Trip>({
          vesselId: dataFilter.vesselId,
          startDate: dataFilter.startDate,
          endDate: dataFilter.endDate
        })
      })
        .pipe(
          // Get trips
          map(res =>  res && res.data || []),
          // Map to gears
          map(trips => {
            if (this._debug) console.debug("[physical-gear-service] Will filter trips:", trips);
            // TODO: group by unique gear (from a hash (GEAR.LABEL + measurements))
            return {
              physicalGears: trips.reduce((res, trip) => {
                // Exclude if no gears
                const tripDate = fromDateISOString(trip.returnDateTime || trip.departureDateTime);
                if (!trip.gears || !tripDate
                  // Or if endDate <= trip date
                  || (dataFilter.startDate && tripDate.isBefore(dataFilter.startDate))
                  || (dataFilter.endDate && tripDate.isSameOrAfter(dataFilter.endDate))
                  || (dataFilter.excludeTripId && trip.id === dataFilter.excludeTripId)) {
                  return res;
                }

                return res.concat(trip.gears.map(gear => {
                  return {
                    ...gear,
                    trip: {
                      departureDateTime: trip.departureDateTime,
                      returnDateTime: trip.returnDateTime
                    }
                  };
                }));
              }, [])
            };
          })
        );
    }
    else {
      this._lastVariables.loadAll = variables;
      const remoteFilter = {...dataFilter};
      delete remoteFilter.excludeTripId;

      if (this._debug) console.debug("[physical-gear-service] Loading physical gears... using options:", variables);
      $loadResult = this.graphql.watchQuery({
        query: LoadAllQuery,
        variables: {
          ...variables,
          filter: remoteFilter
        },
        error: {code: ErrorCodes.LOAD_PHYSICAL_GEARS_ERROR, message: "TRIP.PHYSICAL_GEAR.ERROR.LOAD_PHYSICAL_GEARS_ERROR"},
        fetchPolicy: options && options.fetchPolicy || undefined
      })
        .pipe(
          throttleTime(200), // avoid multiple call
          filter(() => !this.loading)
        );
    }

    return $loadResult
      .pipe(
        map((res) => {
          const data = (res && res.physicalGears || []).map(PhysicalGear.fromObject);
          if (now) {
            console.debug(`[physical-gear-service] Loaded ${data.length} physical gears in ${Date.now() - now}ms`);
            now = undefined;
          }

          // Sort by trip date
          if (dataFilter && dataFilter.vesselId && isNil(dataFilter.tripId)) {
            data.sort(sortByTripDateFn);
          }

          return {
            data: data,
            total: data.length
          };
        })
      );
  }

  async deleteAll(data: PhysicalGear[], options?: any): Promise<any> {
    console.error('PhysicalGearService.deleteAll() not implemented yet');
  }

  async saveAll(data: PhysicalGear[], options?: any): Promise<PhysicalGear[]> {
    console.error('PhysicalGearService.saveAll() not implemented yet !');
    return data;
  }
}