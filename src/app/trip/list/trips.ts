import { Component, EventEmitter, OnInit, Output, ViewChild, OnDestroy } from "@angular/core";
import { MatPaginator, MatSort } from "@angular/material";
import { merge } from "rxjs/observable/merge";
import { Observable } from 'rxjs-compat';
import { startWith, switchMap, mergeMap } from "rxjs/operators";
import { ValidatorService, TableElement } from "angular4-material-table";
import { AppTable, AppTableDataSource, AccountService, TableSelectColumnsComponent } from "../../core/core.module";
import { TripValidatorService } from "../validator/validators";
import { TripService, TripFilter } from "../services/trip-service";
import { SelectionModel } from "@angular/cdk/collections";
import { TripModal } from "../modal/modal-trip";
import { Trip, Referential, VesselFeatures, LocationLevelIds } from "../services/model";
import { Subscription } from "rxjs-compat";
import { ModalController, Platform } from "@ionic/angular";
import { Router, ActivatedRoute } from "@angular/router";
import { VesselService, ReferentialService } from '../../referential/referential.module';
import { Location } from '@angular/common';
import { PopoverController } from '@ionic/angular';
import { FormGroup, Validators, FormBuilder } from "@angular/forms";
import { MatButtonToggle } from "@angular/material";
import { fadeInAnimation, slideInOutAnimation } from "../../shared/material/material.module";
import { vesselFeaturesToString, referentialToString } from "../../referential/services/model";
import { TripPage } from "../page/page-trip";
import { ToolbarComponent } from "../../shared/toolbar/toolbar";
import { AppComponent } from "../../app.component";

@Component({
  selector: 'page-trips',
  templateUrl: 'trips.html',
  providers: [
    { provide: ValidatorService, useClass: TripValidatorService }
  ]/*,

  // make fade in animation available to this component
  animations: [fadeInAnimation, slideInOutAnimation]//,*/

  // attach the fade in animation to the host (root) element of this component
  //host: { '[@fadeInAnimation]': '' }
})
export class TripsPage extends AppTable<Trip, TripFilter> implements OnInit, OnDestroy {

  filterForm: FormGroup;
  vessels: Observable<VesselFeatures[]>;
  locations: Observable<Referential[]>;

  constructor(
    protected route: ActivatedRoute,
    protected router: Router,
    protected platform: Platform,
    protected location: Location,
    protected modalCtrl: ModalController,
    protected accountService: AccountService,
    protected tripValidatorService: TripValidatorService,
    protected tripService: TripService,
    protected vesselService: VesselService,
    protected referentialService: ReferentialService,
    protected formBuilder: FormBuilder
  ) {

    super(route, router, platform, location, modalCtrl, accountService, tripValidatorService,
      new AppTableDataSource<Trip, TripFilter>(Trip, tripService, tripValidatorService),
      ['select', 'id',
        'vessel',
        'departureLocation',
        'departureDateTime',
        'returnDateTime',
        'comments',
        'actions'],
      {} // filter
    );
    this.i18nColumnPrefix = 'TRIP.';
    this.filterForm = formBuilder.group({
      'startDate': [null],
      'endDate': [null],
      'location': [null]
    });
  };

  ngOnInit() {
    super.ngOnInit();

    // Combo: sale locations
    this.locations = this.filterForm.controls.location
      .valueChanges
      .pipe(
        mergeMap(value => {
          if (!value) return Observable.empty();
          if (typeof value != "string" || value.length < 2) return Observable.of([]);
          return this.referentialService.loadAll(0, 10, undefined, undefined,
            {
              levelId: LocationLevelIds.PORT,
              searchText: value as string
            },
            { entityName: 'Location' });
        }));

    // Update filter when changes
    this.filterForm.valueChanges.subscribe(() => {
      const filter = this.filterForm.value;
      this.filter = {
        startDate: filter.startDate,
        endDate: filter.endDate,
        locationId: filter.location && typeof filter.location == "object" && filter.location.id || undefined
      };
    });

    this.onRefresh.subscribe(() => {
      this.filterForm.markAsUntouched();
      this.filterForm.markAsPristine();
    });
  }

  // Not USED - remane in onAddRowDetail() if need)
  async onAddRowDetailUsingModal(): Promise<any> {
    if (this.loading) return Promise.resolve();

    const modal = await this.modalCtrl.create({ component: TripModal });
    // if new trip added, refresh the table
    modal.onDidDismiss(res => res && this.onRefresh.emit());
    return modal.present();
  }

  vesselFeaturesToString = vesselFeaturesToString;
  referentialToString = referentialToString;
}
