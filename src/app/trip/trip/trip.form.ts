import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit} from '@angular/core';
import {TripValidatorService} from "../services/trip.validator";
import {LocationLevelIds, Referential, Trip, VesselFeatures, vesselFeaturesToString} from "../services/trip.model";
import {ModalController, Platform} from "@ionic/angular";
import {Moment} from 'moment/moment';
import {DateAdapter} from "@angular/material";
import {Observable} from 'rxjs';
import {debounceTime, mergeMap, switchMap} from 'rxjs/operators';
import {merge} from "rxjs/observable/merge";
import {AppForm} from '../../core/core.module';
import {
  EntityUtils,
  ReferentialRef,
  ReferentialRefService,
  referentialToString,
  VesselModal,
  VesselService
} from "../../referential/referential.module";

@Component({
  selector: 'form-trip',
  templateUrl: './trip.form.html',
  styleUrls: ['./trip.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripForm extends AppForm<Trip> implements OnInit {

  programs: Observable<ReferentialRef[]>;
  vessels: Observable<VesselFeatures[]>;
  locations: Observable<ReferentialRef[]>;

  @Input() showComment: boolean = true;
  @Input() showError: boolean = true;

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected platform: Platform,
    protected tripValidatorService: TripValidatorService,
    protected vesselService: VesselService,
    protected referentialRefService: ReferentialRefService,
    protected modalCtrl: ModalController,
    protected cd: ChangeDetectorRef
  ) {

    super(dateAdapter, platform, tripValidatorService.getFormGroup());
  }

  ngOnInit() {
    // Combo: programs
    this.programs = this.form.controls['program']
      .valueChanges
      .startWith('*')
      .pipe(
        debounceTime(250),
        switchMap(value => this.referentialRefService.suggest(value, {
          entityName: 'Program'
        }))
      );

    // Combo: vessels
    this.vessels = this.form.controls['vesselFeatures']
      .valueChanges
      .pipe(
        debounceTime(250),
        switchMap(value => this.vesselService.suggest(value))
      );

    // Combo: sale location
    this.locations =
      merge(
        this.form.controls['departureLocation'].valueChanges,
        this.form.controls['returnLocation'].valueChanges
      )
        .pipe(
          debounceTime(250),
          switchMap(value => this.referentialRefService.suggest(value, {
            entityName: 'Location',
            levelId: LocationLevelIds.PORT
          }))
        );
  }

  async addVesselModal(): Promise<any> {
    const modal = await this.modalCtrl.create({ component: VesselModal });
    modal.onDidDismiss().then(res => {
      // if new vessel added, use it
      if (res && res.data instanceof VesselFeatures) {
        console.debug("[trip-form] New vessel added : updating form...", res.data);
        this.form.controls['vesselFeatures'].setValue(res.data);
        this.markForCheck();
      }
      else {
        console.debug("[trip-form] No vessel added (user cancelled)");
      }
    });
    return modal.present();
  }

  vesselFeaturesToString = vesselFeaturesToString;
  referentialToString = referentialToString;

  programToString(value: Referential) {
    return referentialToString(value, ['label']);
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}