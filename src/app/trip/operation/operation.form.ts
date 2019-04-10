import {Component, EventEmitter, Input, OnInit} from '@angular/core';
import {OperationValidatorService} from "../services/operation.validator";
import {Operation, PhysicalGear, toDateISOString, Trip} from "../services/trip.model";
import {Platform} from "@ionic/angular";
import {Moment} from 'moment/moment';
import {DateAdapter} from "@angular/material";
import {Observable} from 'rxjs';
import {debounceTime, map, mergeMap} from 'rxjs/operators';
import {merge} from "rxjs/observable/merge";
import {AccountService, AppForm} from '../../core/core.module';
import {
  EntityUtils,
  ReferentialRef,
  ReferentialRefService,
  referentialToString
} from '../../referential/referential.module';
import {UsageMode} from "../../core/services/model";
import {FormGroup} from "@angular/forms";
import * as moment from "moment";

@Component({
    selector: 'form-operation',
    templateUrl: './operation.form.html',
    styleUrls: ['./operation.form.scss']
})
export class OperationForm extends AppForm<Operation> implements OnInit {

    trip: Trip;
    metiers: Observable<ReferentialRef[]>;
    physicalGears: Observable<PhysicalGear[]>;

    onFocusPhysicalGear: EventEmitter<any> = new EventEmitter<any>();
    onFocusMetier: EventEmitter<any> = new EventEmitter<any>();

    @Input() usageMode: UsageMode;
    @Input() showComment: boolean = true;
    @Input() showError: boolean = true;

    enableGps: boolean;

    constructor(
        protected dateAdapter: DateAdapter<Moment>,
        protected platform: Platform,
        protected physicalGearValidatorService: OperationValidatorService,
        protected referentialRefService: ReferentialRefService,
        protected accountService: AccountService
    ) {

        super(dateAdapter, platform, physicalGearValidatorService.getFormGroup());

    }

    ngOnInit() {
        this.usageMode = this.usageMode || (this.accountService.isUsageMode('FIELD') ? 'FIELD' : 'DESK');
        this.enableGps = (this.usageMode === 'FIELD') /* TODO: && platform has sensor */

        // Combo: physicalGears
        this.physicalGears =
            merge(
                this.form.get('physicalGear').valueChanges.pipe(debounceTime(300)),
                this.onFocusPhysicalGear.pipe(map(any => this.form.get('physicalGear').value))
            )
                .pipe(
                    map(value => {
                        // Display the selected object
                        if (EntityUtils.isNotEmpty(value)) {
                          if (this.form.enabled) this.form.controls["metier"].enable()
                          else this.form.controls["metier"].disable();
                          return [value];
                        }
                        // Skip if no trip (or no physical gears)
                        if (!this.trip || !this.trip.gears || !this.trip.gears.length) {
                          this.form.controls["metier"].disable();
                          return [];
                        }
                        value = (typeof value === "string" && value !== "*") && value || undefined;
                        // Display all trip gears
                        if (!value) return this.trip.gears;
                        // Search on label or name
                        const ucValue = value.toUpperCase();
                        return this.trip.gears.filter(g => g.gear &&
                            (g.gear.label && g.gear.label.toUpperCase().indexOf(ucValue) != -1)
                            || (g.gear.name && g.gear.name.toUpperCase().indexOf(ucValue) != -1)
                        );
                    }));

        // Combo: metiers
        this.metiers = merge(
            this.form.get('metier').valueChanges.pipe(debounceTime(300)),
            this.onFocusMetier.pipe(map(any => this.form.get('metier').value))
        )
            .pipe(
                mergeMap(value => {
                    if (EntityUtils.isNotEmpty(value)) return Observable.of([value]);
                    const physicalGear = this.form.get('physicalGear').value;
                    if (!physicalGear || !physicalGear.gear) return Observable.of([]);
                    value = (typeof value === "string" && value !== "*") && value || undefined;
                    return this.referentialRefService.watchAll(0, !value ? 30 : 10, undefined, undefined,
                        {
                            entityName: 'Metier',
                            levelId: physicalGear && physicalGear.gear && physicalGear.gear.id || null,
                            searchText: value as string
                        }).first().map(({data}) => data);
                }));
    }

    setTrip(trip: Trip) {
        this.trip = trip;

        // Use trip physical gear Object (if possible)
        let physicalGear = this.form.get("physicalGear").value;
        if (physicalGear && physicalGear.id) {
            physicalGear = (this.trip.gears || [physicalGear])
                .find(g => g.id == physicalGear.id)
            if (physicalGear) {
                this.form.controls["physicalGear"].patchValue(physicalGear);
            }
        }
    }


    physicalGearToString(physicalGear: PhysicalGear) {
        return physicalGear && physicalGear.id ? ("#" + physicalGear.rankOrder + " - " + referentialToString(physicalGear.gear)) : undefined;
    }

    /**
     * Get the position by GPS sensor
     * @param fieldName
     */
    fillPosition(fieldName: string) {
      const positionGroup = this.form.controls[fieldName];
      if (positionGroup && positionGroup instanceof FormGroup) {
        positionGroup.patchValue(this.getGPSPosition(), {emitEvent: false, onlySelf: true});
      }
      // Set also the end date time
      if (fieldName == 'endPosition') {
        this.form.controls['endDateTime'].setValue(moment(), {emitEvent: false, onlySelf: true});
      }
      this.form.markAsDirty({onlySelf: true});
    }

  /**
   * Get the position by GPS sensor
   * @param fieldName
   */
  getGPSPosition() : {latitude: number, longitude: number} {
    // TODO : access GPS sensor
    console.log("TODO: get GPS position use FAKE values !!");
    return {
      latitude: 50.11,
      longitude: 0.11
    };
  }

    referentialToString = referentialToString;
}
