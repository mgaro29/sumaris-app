import {Injector, Input, OnDestroy, OnInit} from "@angular/core";
import {BehaviorSubject} from 'rxjs';
import {filter} from "rxjs/operators";
import {TableElement, ValidatorService} from "angular4-material-table";
import {
  AppTable,
  AppTableDataSource, Entity,
  EntityUtils,
  environment,
  LocalSettingsService,
  RESERVED_END_COLUMNS,
  RESERVED_START_COLUMNS, TableDataService
} from "../../core/core.module";
import {getPmfmName, MeasurementUtils, PmfmStrategy} from "../services/trip.model";
import {ModalController, Platform} from "@ionic/angular";
import {ActivatedRoute, Router} from "@angular/router";
import {Location} from '@angular/common';
import {ProgramService} from "../../referential/referential.module";
import {FormBuilder, FormGroup} from "@angular/forms";
import {TranslateService} from '@ngx-translate/core';
import {MeasurementsValidatorService} from "../services/trip.validators";
import {isNotNil} from "../../shared/shared.module";
import {IEntityWithMeasurement, PMFM_ID_REGEXP} from "../services/model/measurement.model";
import {MeasurementsTableDataService} from "./measurements-table.service";
import {AppTableDataSourceOptions} from "../../core/table/table-datasource.class";


export interface AppMeasurementsTableOptions<T extends IEntityWithMeasurement<T>> extends AppTableDataSourceOptions<T> {
  reservedStartColumns?: string[];
  reservedEndColumns?: string[];
}

export abstract class AppMeasurementsTable<T extends IEntityWithMeasurement<T>, F> extends AppTable<T, F>
  implements OnInit, OnDestroy, ValidatorService {

  private _program: string;
  private _acquisitionLevel: string;
  private _pmfms: PmfmStrategy[];

  protected measurementDataService: MeasurementsTableDataService<T, F>;
  protected measurementsValidatorService: MeasurementsValidatorService;

  protected programService: ProgramService;
  protected translate: TranslateService;
  protected formBuilder: FormBuilder;

  measurementValuesFormGroupConfig: { [key: string]: any };
  hasRankOrder = false;

  @Input()
  set program(value: string) {
    this._program = value;
    if (this.measurementDataService) {
      this.measurementDataService.program = value;
    }
  }

  get program(): string {
    return this._program;
  }

  @Input()
  set acquisitionLevel(value: string) {
    this._acquisitionLevel = value;
    if (this.measurementDataService) {
      this.measurementDataService.acquisitionLevel = value;
    }
  }

  get acquisitionLevel(): string {
    return this._acquisitionLevel;
  }

  @Input()
  set showCommentsColumn(value: boolean) {
    this.setShowColumn('comments', value);
  }

  get showCommentsColumn(): boolean {
    return this.getShowColumn('comments');
  }

  get pmfms(): BehaviorSubject<PmfmStrategy[]>  {
    return this.measurementDataService.pmfms;
  }

  protected constructor(
    protected injector: Injector,
    protected dataType: new() => T,
    protected dataService: TableDataService<T, F>,
    protected validatorService?: ValidatorService,
    protected options?: AppMeasurementsTableOptions<T>
  ) {
    super(injector.get(ActivatedRoute),
      injector.get(Router),
      injector.get(Platform),
      injector.get(Location),
      injector.get(ModalController),
      injector.get(LocalSettingsService),
      // Columns:
      RESERVED_START_COLUMNS
        .concat(options && options.reservedStartColumns || [])
        .concat(options && options.reservedEndColumns || [])
        .concat(RESERVED_END_COLUMNS),
      null,
      null,
      injector
    );

    this.measurementsValidatorService = injector.get(MeasurementsValidatorService);
    this.programService = injector.get(ProgramService);
    this.translate = injector.get(TranslateService);
    this.formBuilder = injector.get(FormBuilder);
    this.pageSize = 10000; // Do not use paginator
    this.hasRankOrder = Object.getOwnPropertyNames(new dataType()).findIndex(key => key === 'rankOrder') !== -1;
    this.autoLoad = false;

    this.measurementDataService = new MeasurementsTableDataService<T, F>(this.injector, this.dataType, dataService);
    this.measurementDataService.program = this._program;
    this.measurementDataService.acquisitionLevel = this._acquisitionLevel;
    this.setDatasource(new AppTableDataSource(dataType, this.measurementDataService, this, options));

    // For DEV only
    this.debug = !environment.production;
  }

  ngOnInit() {
    super.ngOnInit();

    this.registerSubscription(
      this.measurementDataService.pmfms
        .pipe(filter(isNotNil))
        .subscribe(pmfms => {
          this._pmfms = pmfms;
          this.measurementValuesFormGroupConfig = this.measurementsValidatorService.getFormGroupConfig(pmfms);
          this.updateColumns();
          this.loading = false;
          //if (this.data) this.onRefresh.emit();
        }));
  }

  getRowValidator(): FormGroup {
    const formGroup = this.validatorService.getRowValidator();
    if (this.measurementValuesFormGroupConfig) {
      if (formGroup.contains('measurementValues')) {
        formGroup.removeControl('measurementValues');
      }
      formGroup.addControl('measurementValues', this.formBuilder.group(this.measurementValuesFormGroupConfig));
    }
    else {
      console.warn('NO measurementValuesFormGroupConfig !');
    }
    return formGroup;
  }

  // addRow(): boolean {
  //   if (this.debug) console.debug("[meas-table] Calling addRow()");
  //
  //   // Create new row
  //   const result = super.addRow();
  //   if (!result) return result;
  //
  //   const row = this.dataSource.getRow(-1);
  //   const obj = new this.dataType() as T;
  //   obj.fromObject(row.currentData);
  //   this.data.push(obj);
  //   this.editedRow = row;
  //   return true;
  // }

  public trackByFn(index: number, row: TableElement<T>) {
    return this.hasRankOrder ? row.currentData.rankOrder : row.currentData.id;
  }

  public updateColumns(pmfms?: PmfmStrategy[]) {

    pmfms = pmfms || this._pmfms;
    if (!pmfms) return;

    let pmfmColumns = pmfms.map(p => p.pmfmId.toString());

    this.displayedColumns = RESERVED_START_COLUMNS
      .concat(this.options && this.options.reservedStartColumns || [])
      .concat(pmfmColumns)
      .concat(this.options && this.options.reservedEndColumns || [])
      .concat(RESERVED_END_COLUMNS)
      // Remove columns to hide
      .filter(column => !this.excludesColumns.includes(column));

    if (!this.loading) this.markForCheck();
  }

  public setShowColumn(columnName: string, show: boolean) {
    super.setShowColumn(columnName, show);

    if (!this.loading) this.updateColumns();
  }

  /* -- protected asbtract methods -- */

  protected async onNewEntity(data: T): Promise<void> {
    // Can be override by subclass
  }

  /* -- protected methods -- */

  protected async getMaxRankOrder(): Promise<number> {
    const rows = await this.dataSource.getRows();
    return rows.reduce((res, row) => Math.max(res, row.currentData.rankOrder || 0), 0);
  }

  protected async onRowCreated(row: TableElement<T>): Promise<void> {
    const data = row.currentData;
    if (this.hasRankOrder) {
      data.rankOrder = (await this.getMaxRankOrder()) + 1;
    }

    await this.onNewEntity(data);

    // Set default values
    (this.measurementDataService.pmfms.getValue() || [])
      .filter(pmfm => isNotNil(pmfm.defaultValue))
      .forEach(pmfm => {
        data.measurementValues[pmfm.pmfmId] = MeasurementUtils.normalizeFormValue(pmfm.defaultValue, pmfm);
      });
    row.currentData = data;

    this.markForCheck();
  }

  protected getI18nColumnName(columnName: string): string {

    // Try to resolve PMFM column, using the cached pmfm list
    if (PMFM_ID_REGEXP.test(columnName)) {
      const pmfmId = parseInt(columnName);
      const pmfm = (this._pmfms || []).find(p => p.pmfmId === pmfmId);
      if (pmfm) return pmfm.name;
    }

    return super.getI18nColumnName(columnName);
  }

  protected sortData(data: T[], sortBy?: string, sortDirection?: string): T[] {
    if (sortBy && PMFM_ID_REGEXP.test(sortBy)) {
      sortBy = 'measurementValues.' + sortBy;
    }
    // Replace id with rankOrder
    sortBy = this.hasRankOrder && (!sortBy || sortBy === 'id') ? 'rankOrder' : sortBy || 'id';
    const after = (!sortDirection || sortDirection === 'asc') ? 1 : -1;
    return data.sort((a, b) => {
      const valueA = EntityUtils.getPropertyByPath(a, sortBy);
      const valueB = EntityUtils.getPropertyByPath(b, sortBy);
      return valueA === valueB ? 0 : (valueA > valueB ? after : (-1 * after));
    });
  }


  getPmfmColumnHeader = getPmfmName;

}
