import {Injectable, Injector} from "@angular/core";
import gql from "graphql-tag";
import {EntityUtils, fillRankOrder, fromDateISOString, isNil, Operation, PhysicalGear, Trip} from "./trip.model";
import {
  EditorDataService,
  isNilOrBlank,
  isNotEmptyArray,
  isNotNil,
  LoadResult,
  TableDataService, toBoolean
} from "../../shared/shared.module";
import {AppFormUtils, environment} from "../../core/core.module";
import {catchError, filter, map, switchMap, tap} from "rxjs/operators";
import {Moment} from "moment";
import {ErrorCodes} from "./trip.errors";
import {AccountService} from "../../core/services/account.service";
import {Fragments} from "./trip.queries";
import {FetchPolicy, WatchQueryFetchPolicy} from "apollo-client";
import {GraphqlService} from "../../core/services/graphql.service";
import {dataIdFromObject} from "../../core/graphql/graphql.utils";
import {RootDataService} from "./root-data-service.class";
import {
  DataEntityAsObjectOptions,
  DataRootEntityUtils,
  MINIFY_OPTIONS,
  SAVE_OPTIMISTIC_AS_OBJECT_OPTIONS,
  SAVE_AS_OBJECT_OPTIONS, SAVE_LOCALLY_AS_OBJECT_OPTIONS,
  SynchronizationStatus
} from "./model/base.model";
import {NetworkService} from "../../core/services/network.service";
import {concat, defer, Observable, of, timer} from "rxjs";
import {EntityStorage} from "../../core/services/entities-storage.service";
import {isEmptyArray} from "../../shared/functions";
import {DataQualityService} from "./base.service";
import {OperationFilter, OperationService} from "./operation.service";
import {VesselSnapshotFragments, VesselSnapshotService} from "../../referential/services/vessel-snapshot.service";
import {ReferentialRefService} from "../../referential/services/referential-ref.service";
import {PersonService} from "../../admin/services/person.service";
import {ProgramService} from "../../referential/services/program.service";
import {concatPromises} from "../../shared/observables";
import {LocalSettingsService} from "../../core/services/local-settings.service";
import {TripValidatorService} from "./trip.validator";
import {FormErrors} from "../../core/form/form.utils";
import {ValidatorService} from "angular4-material-table";
import {LandingValidatorService} from "./landing.validator";
import {DataRootEntityValidatorService} from "./validator/base.validator";
import {AcquisitionLevelType, ProgramProperties} from "../../referential/services/model";

const physicalGearFragment = gql`fragment PhysicalGearFragment on PhysicalGearVO {
    id
    rankOrder
    updateDate
    creationDate
    comments
    gear {
      ...ReferentialFragment
    }
    recorderDepartment {
      ...LightDepartmentFragment
    }
    measurementValues
  }
`;

export const TripFragments = {
  physicalGear: physicalGearFragment,
  lightTrip: gql`fragment LightTripFragment on TripVO {
    id
    program {
      id
      label
    }
    departureDateTime
    returnDateTime
    creationDate
    updateDate
    controlDate
    validationDate
    qualificationDate
    qualityFlagId
    comments
    departureLocation {
      ...LocationFragment
    }
    returnLocation {
      ...LocationFragment
    }
    vesselSnapshot {
        ...LightVesselSnapshotFragment
    }
    recorderDepartment {
      ...LightDepartmentFragment
    }
    recorderPerson {
      ...LightPersonFragment
    }
    observers {
      ...LightPersonFragment
    }
  }
  ${Fragments.location}
  ${Fragments.lightDepartment}
  ${Fragments.lightPerson}
  ${VesselSnapshotFragments.lightVesselSnapshot}
  `,
  trip: gql`fragment TripFragment on TripVO {
    id
    program {
      id
      label
    }
    departureDateTime
    returnDateTime
    creationDate
    updateDate
    controlDate
    validationDate
    qualificationDate
    qualityFlagId
    comments
    departureLocation {
      ...LocationFragment
    }
    returnLocation {
      ...LocationFragment
    }
    vesselSnapshot {
      ...LightVesselSnapshotFragment
    }
    sale {
      id
      startDateTime
      creationDate
      updateDate
      comments
      saleType {
        ...ReferentialFragment
      }
      saleLocation {
        ...LocationFragment
      }
    }
    gears {
      ...PhysicalGearFragment
    }
    measurements {
      ...MeasurementFragment
    }
    recorderDepartment {
      ...LightDepartmentFragment
    }
    recorderPerson {
      ...LightPersonFragment
    }
    observers {
      ...LightPersonFragment
    }
  }
  ${Fragments.lightDepartment}
  ${Fragments.lightPerson}
  ${Fragments.measurement}
  ${Fragments.referential}
  ${Fragments.location}
  ${VesselSnapshotFragments.lightVesselSnapshot}
  ${physicalGearFragment}
  `
};

export const TRIP_FEATURE = 'trip';

export class TripFilter {

  static isEmpty(filter: TripFilter|any): boolean {
    return !filter || (isNilOrBlank(filter.programLabel) && isNilOrBlank(filter.vesselId) && isNilOrBlank(filter.locationId)
      && !filter.startDate && !filter.endDate
      && isNil(filter.recorderDepartmentId))
      // && !filter.synchronizationStatus -- not included, because separated button
      ;
  }

  static searchFilter<T extends Trip>(f: TripFilter): (T) => boolean {
    if (this.isEmpty(f)) return undefined; // no filter need
    return (t: T) => {

      // Program
      if (f.programLabel && (!t.program || t.program.label !== f.programLabel)) {
        return false;
      }

      // Vessel
      if (isNotNil(f.vesselId) && t.vesselSnapshot && t.vesselSnapshot.id !== f.vesselId) {
        return false;
      }

      // Location
      if (isNotNil(f.locationId) && ((t.departureLocation && t.departureLocation.id !== f.locationId) ? (t.returnLocation && t.returnLocation.id !== f.locationId) : true)) {
        return false;
      }

      // Recorder department
      if (isNotNil(f.recorderDepartmentId) && t.recorderDepartment && t.recorderDepartment.id !== f.recorderDepartmentId) {
        return false;
      }

      // Start/end period
      const startDate = fromDateISOString(f.startDate);
      const endDate = fromDateISOString(f.endDate);
      if ((startDate && t.returnDateTime && startDate.isAfter(t.returnDateTime))
        || (endDate && t.departureDateTime && endDate.add(1, 'day').isSameOrBefore(t.departureDateTime))) {
        return false;
      }

      // Synchronization status
      if (f.synchronizationStatus && (
        // Check trip synchro status, if any
        (t.synchronizationStatus && t.synchronizationStatus !== f.synchronizationStatus)
        // Else, if SYNC is wanted: exclude if local id
        || (f.synchronizationStatus === 'SYNC' && !t.synchronizationStatus && t.id < 0)
        // Or else, if DIRTY or READY_TO_SYNC wanted: exclude if id is NOT local
        || (f.synchronizationStatus !== 'SYNC' && !t.synchronizationStatus && t.id >= 0))
      ) {
        return false;
      }

      return true;
    };
  }

  programLabel?: string;
  vesselId?: number;
  locationId?: number;
  startDate?: Date | Moment;
  endDate?: Date | Moment;
  recorderDepartmentId?: number;
  synchronizationStatus?: SynchronizationStatus;
  acquisitionLevel?: AcquisitionLevelType;
}

const LoadAllQuery: any = gql`
  query Trips($offset: Int, $size: Int, $sortBy: String, $sortDirection: String, $filter: TripFilterVOInput){
    trips(filter: $filter, offset: $offset, size: $size, sortBy: $sortBy, sortDirection: $sortDirection){
      ...LightTripFragment
    }
    tripsCount(filter: $filter)
  }
  ${TripFragments.lightTrip}
`;
// Load a trip
const LoadQuery: any = gql`
  query Trip($id: Int!) {
    trip(id: $id) {
      ...TripFragment
    }
  }
  ${TripFragments.trip}
`;
const SaveAllQuery: any = gql`
  mutation saveTrips($trips:[TripVOInput], $withOperation: Boolean!){
    saveTrips(trips: $trips, withOperation: $withOperation){
      ...TripFragment
    }
  }
  ${TripFragments.trip}
`;
const ControlMutation: any = gql`
  mutation ControlTrip($trip:TripVOInput){
    controlTrip(trip: $trip){
      ...TripFragment
    }
  }
  ${TripFragments.trip}
`;
const ValidateMutation: any = gql`
  mutation ValidateTrip($trip:TripVOInput){
    validateTrip(trip: $trip){
      ...TripFragment
    }
  }
  ${TripFragments.trip}
`;
const QualifyMutation: any = gql`
  mutation QualifyTrip($trip:TripVOInput){
    qualifyTrip(trip: $trip){
      ...TripFragment
    }
  }
  ${TripFragments.trip}
`;
const UnvalidateMutation: any = gql`
  mutation UnvalidateTrip($trip:TripVOInput){
    unvalidateTrip(trip: $trip){
      ...TripFragment
    }
  }
  ${TripFragments.trip}
`;
const DeleteByIdsMutation: any = gql`
  mutation DeleteTrips($ids:[Int]){
    deleteTrips(ids: $ids)
  }
`;

const UpdateSubscription = gql`
  subscription UpdateTrip($id: Int!, $interval: Int){
    updateTrip(id: $id, interval: $interval) {
      ...TripFragment
    }
  }
  ${TripFragments.trip}
`;

@Injectable({providedIn: 'root'})
export class TripService extends RootDataService<Trip, TripFilter>
  implements
    TableDataService<Trip, TripFilter>,
    EditorDataService<Trip, TripFilter>,
    DataQualityService<Trip> {

  protected $importationProgress: Observable<number>;
  protected loading = false;

  constructor(
    injector: Injector,
    protected graphql: GraphqlService,
    protected network: NetworkService,
    protected accountService: AccountService,
    protected referentialRefService: ReferentialRefService,
    protected vesselSnapshotService: VesselSnapshotService,
    protected personService: PersonService,
    protected programService: ProgramService,
    protected entities: EntityStorage,
    protected operationService: OperationService,
    protected settings: LocalSettingsService,
    protected validatorService: TripValidatorService
  ) {
    super(injector);

    // FOR DEV ONLY
    this._debug = !environment.production;
  }

  /**
   * Load many trips
   * @param offset
   * @param size
   * @param sortBy
   * @param sortDirection
   * @param dataFilter
   */
  watchAll(offset: number,
           size: number,
           sortBy?: string,
           sortDirection?: string,
           dataFilter?: TripFilter,
           options?: {
             fetchPolicy?: WatchQueryFetchPolicy
           }): Observable<LoadResult<Trip>> {
    const variables: any = {
      offset: offset || 0,
      size: size || 20,
      sortBy: sortBy || 'departureDateTime',
      sortDirection: sortDirection || 'asc',
      filter: { ...dataFilter, synchronizationStatus: undefined}
    };

    let now = this._debug && Date.now();
    let $loadResult: Observable<{ trips: Trip[]; tripsCount?: number; }>;
    if (this._debug) console.debug("[trip-service] Watching trips... using options:", variables);

    // Offline
    const offline = this.network.offline || (dataFilter && dataFilter.synchronizationStatus && dataFilter.synchronizationStatus !== 'SYNC') || false;
    if (offline) {
      $loadResult = this.entities.watchAll<Trip>('TripVO', {
        ...variables,
        filter: TripFilter.searchFilter<Trip>(dataFilter)
      })
        .pipe(
          map(res => {
            return {trips: res && res.data, tripsCount: res && res.total};
          }));
    }
    else {

      this._lastVariables.loadAll = variables;

      const query = LoadAllQuery;
      $loadResult = this.graphql.watchQuery<{ trips: Trip[]; tripsCount: number; }>({
        query,
        variables,
        error: { code: ErrorCodes.LOAD_TRIPS_ERROR, message: "TRIP.ERROR.LOAD_TRIPS_ERROR" },
        fetchPolicy: options && options.fetchPolicy || (this.network.offline ? 'cache-only' : 'cache-and-network')
      })
        .pipe(
          filter(() => !this.loading)
        );
    }

    return $loadResult.pipe(
        map(res => {
          const data = (res && res.trips || []).map(Trip.fromObject);
          const total = res && isNotNil(res.tripsCount) ? res.tripsCount : undefined;
          if (now) {
            console.debug(`[trip-service] Loaded {${data.length || 0}} trips in ${Date.now() - now}ms`, data);
            now = undefined;
          }
          return {
            data: data,
            total: total
          };
        })
      );
  }

  async load(id: number, options?: {fetchPolicy: FetchPolicy}): Promise<Trip | null> {
    if (isNil(id)) throw new Error("Missing argument 'id'");

    const now = this._debug && Date.now();
    if (this._debug) console.debug(`[trip-service] Loading trip #${id}...`);
    this.loading = true;

    try {
      let json: any;

      // If local entity
      if (id < 0) {
        json = await this.entities.load<Trip>(id, Trip.TYPENAME);
      }

      else {
        // Load remotely
        const res = await this.graphql.query<{ trip: Trip }>({
          query: LoadQuery,
          variables: {
            id: id
          },
          error: { code: ErrorCodes.LOAD_TRIP_ERROR, message: "TRIP.ERROR.LOAD_TRIP_ERROR" },
          fetchPolicy: options && options.fetchPolicy || undefined
        });
        json = res && res.trip;
      }

      // Transform to entity
      const data = Trip.fromObject(json);
      if (data && this._debug) console.debug(`[trip-service] Trip #${id} loaded in ${Date.now() - now}ms`, data);
      return data;
    }
    finally {
      this.loading = false;
    }


  }

  async hasOfflineData(): Promise<boolean> {
    const res = await this.entities.loadAll('TripVO', {
      offset: 0,
      size: 0
    });
    return res && res.total > 0;
  }

  listenChanges(id: number): Observable<Trip> {
    if (isNil(id)) throw new Error("Missing argument 'id' ");

    if (this._debug) console.debug(`[trip-service] [WS] Listening changes for trip {${id}}...`);

    return this.graphql.subscribe<{ updateTrip: Trip }, { id: number, interval: number }>({
      query: UpdateSubscription,
      variables: {
        id: id,
        interval: 10
      },
      error: {
        code: ErrorCodes.SUBSCRIBE_TRIP_ERROR,
        message: 'TRIP.ERROR.SUBSCRIBE_TRIP_ERROR'
      }
    })
      .pipe(
        map(res => {
          const data = res && res.updateTrip && Trip.fromObject(res.updateTrip);
          if (data && this._debug) console.debug(`[trip-service] Trip {${id}} updated on server !`, data);
          return data;
        })
      );
  }

  /**
   * Save many trips
   * @param entities
   * @param options
   */
  async saveAll(entities: Trip[], options?: any): Promise<Trip[]> {
    if (!entities) return entities;

    const json = entities.map(t => {
      // Fill default properties (as recorder department and person)
      this.fillDefaultProperties(t);
      return this.asObject(t);
    });

    const now = Date.now();
    if (this._debug) console.debug("[trip-service] Saving trips...", json);

    await this.graphql.mutate<{ saveTrips: Trip[] }>({
      mutation: SaveAllQuery,
      variables: {
        trips: json
      },
      error: { code: ErrorCodes.SAVE_TRIPS_ERROR, message: "TRIP.ERROR.SAVE_TRIPS_ERROR" },
      update: (proxy, {data}) => {

        if (this._debug) console.debug(`[trip-service] Trips saved remotely in ${Date.now() - now}ms`, entities);

        (data && data.saveTrips && entities || [])
          .forEach(entity => {
            const savedEntity = data.saveTrips.find(t => entity.equals(t));
            if (savedEntity && savedEntity !== entity) {
              this.copyIdAndUpdateDate(savedEntity, entity);
            }
          });
      }
    });

    return entities;
  }

  /**
   * Save a trip
   * @param data
   */
  async save(entity: Trip, opts?: {withOperation?: boolean;}): Promise<Trip> {

    const withOperation = toBoolean(opts && opts.withOperation, false);

    const now = Date.now();
    if (this._debug) console.debug("[trip-service] Saving a trip...", entity);

    // Prepare to save
    this.fillDefaultProperties(entity);

    // Reset the control date
    entity.controlDate = undefined;
    entity.validationDate = undefined;
    entity.qualificationDate = undefined;
    entity.qualityFlagId = undefined;

    // If new, create a temporary if (for offline mode)
    const isNew = isNil(entity.id);

    // If is a local entity: force a local save
    const offline = isNew ? (entity.synchronizationStatus && entity.synchronizationStatus !== 'SYNC') : entity.id < 0;
    if (offline) {
      // Make sure to fill id, with local ids
      await this.fillOfflineDefaultProperties(entity);

      // Reset synchro status
      entity.synchronizationStatus = 'DIRTY';

      const json = this.asObject(entity, SAVE_LOCALLY_AS_OBJECT_OPTIONS);
      if (this._debug) console.debug('[trip-service] [offline] Saving trip locally...', json);

      // Save response locally
      await this.entities.save(json);

      return entity;
    }

    // When offline, provide an optimistic response
    const offlineResponse = async (context) => {
      // Make sure to fill id, with local ids
      await this.fillOfflineDefaultProperties(entity);

      // For the query to be tracked (see tracked query link) with a unique serialization key
      context.tracked = (!entity.synchronizationStatus || entity.synchronizationStatus === 'SYNC');
      if (isNotNil(entity.id)) context.serializationKey = dataIdFromObject(entity);

      return { saveTrips: [this.asObject(entity, SAVE_OPTIMISTIC_AS_OBJECT_OPTIONS)] };
    };

    // Transform into json
    const json = this.asObject(entity, SAVE_AS_OBJECT_OPTIONS);
    if (this._debug) console.debug("[trip-service] Using minify object, to send:", json);

    await this.graphql.mutate<{ saveTrips: any }>({
       mutation: SaveAllQuery,
       variables: {
         trips: [json],
         withOperation
       },
       offlineResponse,
       error: { code: ErrorCodes.SAVE_TRIP_ERROR, message: "TRIP.ERROR.SAVE_TRIP_ERROR" },
       update: async (proxy, {data}) => {
         const savedEntity = data && data.saveTrips && data.saveTrips[0];

         // Local entity: save it
         if (savedEntity.id < 0) {
           if (this._debug) console.debug('[trip-service] [offline] Saving trip locally...', savedEntity);

           // Save response locally
           await this.entities.save<Trip>(savedEntity);
         }

         // Update the entity and update GraphQL cache
         else {

           // Remove existing entity from the local storage
           if (entity.id < 0 && (savedEntity.id > 0 || savedEntity.updateDate)) {
             if (this._debug) console.debug(`[trip-service] Deleting trip {${entity.id}} from local storage`);
             await this.entities.delete(entity);

             try {
               // Remove linked operations
               if (opts && opts.withOperation) {
                 await this.operationService.deleteLocallyByTripId(entity.id);
               }
             }
             catch(err) {
               console.error(`[trip-service] Failed to locally delete operations of trip {${entity.id}}`, err);
             }
           }

           // Copy id and update Date
           this.copyIdAndUpdateDate(savedEntity, entity);

           if (this._debug) console.debug(`[trip-service] Trip saved remotely in ${Date.now() - now}ms`, entity);

           // Add to cache
           if (isNew && this._lastVariables.loadAll) {
             this.graphql.addToQueryCache(proxy,{
               query: LoadAllQuery,
               variables: this._lastVariables.loadAll
             }, 'trips', savedEntity);
           }
           else if (this._lastVariables.load) {
             this.graphql.updateToQueryCache(proxy,{
               query: LoadQuery,
               variables: this._lastVariables.load
             }, 'trip', savedEntity);
           }
         }

       }
     });

    return entity;
  }

  async synchronizeById(id: number): Promise<Trip> {
    const entity = await this.load(id);

    if (!entity || entity.id >= 0) return; // skip

    return await this.synchronize(entity);
  }

  async synchronize(entity: Trip): Promise<Trip> {
    const localId = entity && entity.id;
    if (isNil(localId) || localId >= 0) {
      throw new Error("Entity must be a local entity");
    }
    if (this.network.offline) {
      throw new Error("Could not synchronize if network if offline");
    }

    // Load operations
    const res = await this.entities.loadAll<Operation>('OperationVO', {
      filter: OperationFilter.searchFilter<Operation>({tripId: localId})
    });
    entity.operations = (res && res.data || []).map(Operation.fromObject);
    entity.synchronizationStatus = 'SYNC';
    entity.id = undefined;

    try {
      entity = await this.save(entity, {withOperation: true});
      if (entity.id < 0) {
        throw {code: ErrorCodes.SYNCHRONIZE_TRIP_ERROR, message: "TRIP.ERROR.SYNCHRONIZE_TRIP_ERROR"};
      }
    } catch (err) {
      throw {...err, code: ErrorCodes.SYNCHRONIZE_TRIP_ERROR, message: "TRIP.ERROR.SYNCHRONIZE_TRIP_ERROR"};
    }

    try {
      if (this._debug) console.debug(`[trip-service] Deleting trip {${entity.id}} from local storage`);

      // Delete trip's operations
      await this.operationService.deleteLocallyByTripId(localId);

      // Delete trip
      await this.entities.deleteById(localId, Trip.TYPENAME);
    }
    catch (err) {
      console.error(`[trip-service] Failed to locally delete trip {${entity.id}} and its operations`, err);
      // Continue
    }
    return entity;
  }

  /**
   * Control the validity of an trip
   * @param entity
   */
  async control(entity: Trip, opts?: any): Promise<FormErrors> {


    const now = this._debug && Date.now();
    if (this._debug) console.debug(`[trip-service] Control trip {${entity.id}}...`, entity);

    const programLabel = entity.program && entity.program.label || null;
    if (!programLabel) throw new Error("Missing trip's program. Unable to control the trip");
    const program = await this.programService.loadByLabel(programLabel);

    const form = this.validatorService.getFormGroup(entity, {
      isOnFieldMode: false,
      program,
      withMeasurements: true
    });

    if (!form.valid) {
      // Wait end of validation (e.g. async validators)
      await AppFormUtils.waitWhilePending(form);

      // Get form errors
      if (form.invalid) {
        const errors = AppFormUtils.getFormErrors(form, 'trip');

        if (this._debug) console.debug(`[trip-service] Control trip {${entity.id}} [INVALID] in ${Date.now() - now}ms`, errors);

        return errors;
      }
    }

    if (this._debug) console.debug(`[trip-service] Control trip {${entity.id}} [OK] in ${Date.now() - now}ms`);

    return undefined;
  }

  /**
   * Terminate the trip
   * @param entity
   */
  async terminate(entity: Trip): Promise<Trip> {
    if (isNil(entity.id)) {
      throw new Error("Entity must be saved before terminate !");
    }

    // If local entity: save locally
    const offline = entity.id < 0;
    if (offline) {

      // Make sure to fill id, with local ids
      await this.fillOfflineDefaultProperties(entity);

      // Update sync status
      entity.synchronizationStatus = 'READY_TO_SYNC';

      const json = this.asObject(entity, SAVE_LOCALLY_AS_OBJECT_OPTIONS);
      if (this._debug) console.debug('[trip-service] [offline] Terminate trip locally...', json);

      // Save response locally
      await this.entities.save(json);

      return entity;
    }

    // Prepare to save
    this.fillDefaultProperties(entity);

    // Transform into json
    const json = this.asObject(entity);

    const now = this._debug && Date.now();
    if (this._debug) console.debug("[trip-service] Terminate trip...", json);

    await this.graphql.mutate<{ controlTrip: any }>({
      mutation: ControlMutation,
      variables: {
        trip: json
      },
      error: { code: ErrorCodes.TERMINATE_TRIP_ERROR, message: "TRIP.ERROR.TERMINATE_TRIP_ERROR" },
      update: async (proxy, {data}) => {
        const savedEntity = data && data.controlTrip;
        if (savedEntity) {
          this.copyIdAndUpdateDate(savedEntity, entity);
          entity.controlDate = savedEntity.controlDate || entity.controlDate;
          entity.validationDate = savedEntity.validationDate || entity.validationDate;
        }

        if (this._debug) console.debug(`[trip-service] Trip controlled in ${Date.now() - now}ms`, entity);
      }
    });


    return entity;
  }

  /**
   * Validate the trip
   * @param entity
   */
  async validate(entity: Trip): Promise<Trip> {

    if (isNil(entity.id) || entity.id < 0) {
      throw new Error("Entity must be saved once before validate !");
    }
    if (isNil(entity.controlDate)) {
      throw new Error("Entity must be controlled before validate !");
    }
    if (isNotNil(entity.validationDate)) {
      throw new Error("Entity is already validated !");
    }

    // Prepare to save
    this.fillDefaultProperties(entity);

    // Transform into json
    const json = this.asObject(entity);

    const now = Date.now();
    if (this._debug) console.debug("[trip-service] Validate trip...", json);

    const res = await this.graphql.mutate<{ validateTrip: any }>({
      mutation: ValidateMutation,
      variables: {
        trip: json
      },
      error: { code: ErrorCodes.VALIDATE_TRIP_ERROR, message: "TRIP.ERROR.VALIDATE_TRIP_ERROR" }
    });

    const savedEntity = res && res.validateTrip;
    if (savedEntity) {
      this.copyIdAndUpdateDate(savedEntity, entity);
      entity.controlDate = savedEntity.controlDate || entity.controlDate;
      entity.validationDate = savedEntity.validationDate || entity.validationDate;
    }

    if (this._debug) console.debug(`[trip-service] Trip validated in ${Date.now() - now}ms`, entity);

    return entity;
  }

  /**
   * Unvalidate the trip
   * @param entity
   */
  async unvalidate(entity: Trip): Promise<Trip> {

    if (isNil(entity.validationDate)) {
      throw new Error("Entity is not validated yet !");
    }

    // Prepare to save
    this.fillDefaultProperties(entity);

    // Transform into json
    const json = this.asObject(entity);

    const now = Date.now();
    if (this._debug) console.debug("[trip-service] Unvalidate trip...", json);

    await this.graphql.mutate<{ unvalidateTrip: any }>({
      mutation: UnvalidateMutation,
      variables: {
        trip: json
      },
      context: {
        // TODO serializationKey:
        tracked: true
      },
      error: { code: ErrorCodes.UNVALIDATE_TRIP_ERROR, message: "TRIP.ERROR.UNVALIDATE_TRIP_ERROR" },
      update: (proxy, {data}) => {
        const savedEntity = data && data.unvalidateTrip;
        if (savedEntity) {
          if (savedEntity !== entity) {
            this.copyIdAndUpdateDate(savedEntity, entity);
          }

          entity.controlDate = savedEntity.controlDate || entity.controlDate;
          entity.validationDate = savedEntity.validationDate; // should be null

          if (this._debug) console.debug(`[trip-service] Trip unvalidated in ${Date.now() - now}ms`, entity);
        }

      }
    });

    return entity;
  }

  async qualify(entity: Trip, qualityFlagId: number): Promise<Trip> {

    if (isNil(entity.validationDate)) {
      throw new Error("Entity is not validated yet !");
    }

    // Prepare to save
    this.fillDefaultProperties(entity);

    // Transform into json
    const json = this.asObject(entity);

    json.qualityFlagId = qualityFlagId;

    const now = Date.now();
    if (this._debug) console.debug("[trip-service] Qualifying trip...", json);

    const res = await this.graphql.mutate<{ qualifyTrip: any }>({
      mutation: QualifyMutation,
      variables: {
        trip: json
      },
      error: { code: ErrorCodes.QUALIFY_TRIP_ERROR, message: "TRIP.ERROR.QUALIFY_TRIP_ERROR" }
    });

    const savedEntity = res && res.qualifyTrip;
    if (savedEntity) {
      this.copyIdAndUpdateDate(savedEntity, entity);
      entity.controlDate = savedEntity.controlDate;
      entity.validationDate = savedEntity.validationDate;
      entity.qualificationDate = savedEntity.qualificationDate; // can be null
      entity.qualityFlagId = savedEntity.qualityFlagId; // can be 0
    }

    if (this._debug) console.debug(`[trip-service] Trip qualified in ${Date.now() - now}ms`, entity);

    return entity;
  }

  async delete(data: Trip): Promise<any> {
    if (!data) return; // skip
    await this.deleteAll([data]);
  }

  /**
   * Save many trips
   * @param entities
   */
  async deleteAll(entities: Trip[]): Promise<any> {

    // Get local entity ids, then delete id
    const localIds = entities && entities
      .map(t => t.id)
      .filter(id => id < 0);
    if (isNotEmptyArray(localIds)) {
      if (this._debug) console.debug("[trip-service] Deleting trips locally... ids:", localIds);
      await this.entities.deleteMany<Trip>(localIds, 'TripVO');

      // Cascade to operation, trip by trip
      await concatPromises(localIds.map(id => {
          return () => this.operationService.deleteLocallyByTripId(id);
        }));
    }

    const remoteIds = entities && entities
      .map(t => t.id)
      .filter(id => id >= 0);
    if (isEmptyArray(remoteIds)) return; // stop, if nothing else to do

    const now = Date.now();
    if (this._debug) console.debug("[trip-service] Deleting trips... ids:", remoteIds);

    await this.graphql.mutate<any>({
      mutation: DeleteByIdsMutation,
      variables: {
        ids: remoteIds
      },
      update: (proxy) => {
        // Update the cache
        if (this._lastVariables.loadAll) {
          this.graphql.removeToQueryCacheByIds(proxy, {
            query: LoadAllQuery,
            variables: this._lastVariables.loadAll
          }, 'trips', remoteIds);
        }

        if (this._debug) console.debug(`[trip-service] Trips deleted remotely in ${Date.now() - now}ms`);
      }
    });
  }

  executeImport(opts?: {
    maxProgression?: number;
  }): Observable<number>{
    if (this.$importationProgress) return this.$importationProgress; // Skip to may call

    const maxProgression = opts && opts.maxProgression || 100;

    const jobOpts = {maxProgression: undefined};
    const jobDefers: Observable<number>[] = [
      // Clear caches
      defer(() => timer()
        .pipe(
          switchMap(() => this.network.clearCache()),
          map(() => jobOpts.maxProgression as number)
        )
      ),
      // Start to import data
      defer(() => this.referentialRefService.executeImport(jobOpts)),
      defer(() =>  this.personService.executeImport(jobOpts)),
      defer(() => this.vesselSnapshotService.executeImport(jobOpts)),
      defer(() => this.programService.executeImport(jobOpts)),
      // Save date to local storage
      defer(() =>
        timer()
          .pipe(
            switchMap(() => this.entities.persist()),
            map(() => jobOpts.maxProgression as number)
          )
      )
    ];
    const jobCount = jobDefers.length;
    jobOpts.maxProgression = Math.trunc(maxProgression / jobCount);

    const now = Date.now();
    console.info(`[trip-service] Starting ${jobDefers.length} importation jobs...`);

    // Execute all jobs, one by one
    let jobIndex = 0;
    this.$importationProgress = concat(
      ...jobDefers.map((jobDefer: Observable<number>, index) => {
        return jobDefer
          .pipe(
            //switchMap(() => jobDefer),
            map(jobProgression => {
              jobIndex = index;
              if (this._debug && jobProgression > jobOpts.maxProgression) {
                console.warn(`[trip-service] WARN job #${jobIndex} return a jobProgression > maxProgression (${jobProgression} > ${jobOpts.maxProgression})!`);
              }
              // Compute total progression
              return index * jobOpts.maxProgression + Math.min(jobProgression || 0, jobOpts.maxProgression);
            })
          );
      }),

      // Finish (force to reach max value)
      of(maxProgression)
        .pipe(
          tap(() => {
            this.$importationProgress = null;
            console.info(`[trip-service] Importation finished in ${Date.now() - now}ms`);
            this.settings.registerOfflineFeature(TRIP_FEATURE);
          })
        ))

      .pipe(
        catchError((err) => {
          this.$importationProgress = null;
          console.error(`[trip-service] Error during importation (job #${jobIndex + 1}): ${err && err.message || err}`, err);
          throw err;
        }),
        // Compute total progression (= job offset + job progression)
        // (and make ti always <= maxProgression)
        map((progression) =>  Math.min(progression, maxProgression))
      );

    return this.$importationProgress;
  }

  async downloadToLocal(id: number, opts?: {
    withOperations?: boolean
  }): Promise<Trip> {

    console.debug("[trip-service] Download trip locally...");

    const entity = await this.load(id, {fetchPolicy: "network-only"});

    // Remove ids
    delete entity.id;
    (entity.gears || []).forEach(g => g.id = undefined);
    (entity.measurements || []).forEach(m => m.id = undefined);

    // Make sure to fill id, with local ids
    await this.fillOfflineDefaultProperties(entity);

    const json = this.asObject(entity, SAVE_LOCALLY_AS_OBJECT_OPTIONS);

    // Save the trip
    const savedTrip = await this.entities.save(json, {entityName: Trip.TYPENAME});

    // Copy the operations
    if (opts && opts.withOperations) {
      const res = await this.operationService.watchAll(0,1000, null, null, {
        tripId: id
      }, {
        fetchPolicy: "network-only"
      }).toPromise();

      if (res && res.data) {
        const savedOperations = await Promise.all(res.data.map(op => {
          delete op.id;
          op.tripId = savedTrip.id;
          delete op.physicalGear.id; // keep rankorder
          (op.measurements || []).forEach(m => m.id = undefined);
          (op.positions || []).forEach(p => p.id = undefined);

          return this.operationService.save(op);
        }));
      }
    }

    return entity;
  }

  /* -- protected methods -- */


  protected asObject(entity: Trip, opts?: DataEntityAsObjectOptions): any {
    opts = { ...MINIFY_OPTIONS, ...opts };
    const copy: any = entity.asObject(opts);

    // Fill return date using departure date
    copy.returnDateTime = copy.returnDateTime || copy.departureDateTime;

    // Fill return location using departure location
    if (!copy.returnLocation || !copy.returnLocation.id) {
      copy.returnLocation = { ...copy.departureLocation };
    }

    // Full json optimisation
    if (opts.minify && !opts.keepEntityName && !opts.keepTypename) {
      // Clean vessel features object, before saving
      copy.vesselSnapshot = {id: entity.vesselSnapshot && entity.vesselSnapshot.id};
    }

    return copy;
  }

  protected fillDefaultProperties(entity: Trip) {

    super.fillDefaultProperties(entity);

    // Physical gears: compute rankOrder
    fillRankOrder(entity.gears);

    // Measurement: compute rankOrder
    fillRankOrder(entity.measurements);
  }

  protected async fillOfflineDefaultProperties(entity: Trip) {
    const isNew = isNil(entity.id);

    // If new, generate a local id
    if (isNew) {
      entity.id =  await this.entities.nextValue(entity);
    }

    // Fill default synchronization status
    entity.synchronizationStatus = entity.synchronizationStatus || 'DIRTY';

    // Fill gear id
    const gears = entity.gears || [];
    await EntityUtils.fillLocalIds(gears, (_, count) => this.entities.nextValues(PhysicalGear.TYPENAME, count));
  }

  copyIdAndUpdateDate(source: Trip | undefined, target: Trip) {
    if (!source) return;

    // Update (id and updateDate), and control validation
    super.copyIdAndUpdateDate(source, target);

    // Update sale
    if (target.sale && source.sale) {
      EntityUtils.copyIdAndUpdateDate(source.sale, target.sale);
      DataRootEntityUtils.copyControlAndValidationDate(source.sale, target.sale);
    }

    // Update gears
    if (target.gears && source.gears) {
      target.gears.forEach(targetGear => {
        const sourceGear = source.gears.find(json => targetGear.equals(json));
        EntityUtils.copyIdAndUpdateDate(sourceGear, targetGear);
        DataRootEntityUtils.copyControlAndValidationDate(sourceGear, targetGear);

        // Update measurements
        if (sourceGear && targetGear.measurements && sourceGear.measurements) {
          targetGear.measurements.forEach(targetMeasurement => {
            const savedMeasurement = sourceGear.measurements.find(m => targetMeasurement.equals(m));
            EntityUtils.copyIdAndUpdateDate(savedMeasurement, targetMeasurement);
          });
        }
      });
    }

    // Update measurements
    if (target.measurements && source.measurements) {
      target.measurements.forEach(entity => {
        const savedMeasurement = source.measurements.find(m => entity.equals(m));
        EntityUtils.copyIdAndUpdateDate(savedMeasurement, entity);
      });
    }
  }

}
