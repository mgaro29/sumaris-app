import {ChangeDetectionStrategy, Component, Injector} from "@angular/core";
import {TableElement, ValidatorService} from "angular4-material-table";
import {Batch, PmfmStrategy, ReferentialRef, TaxonGroupIds} from "../services/trip.model";
import {TaxonomicLevelIds,} from "../../referential/referential.module";
import {BatchGroupsValidatorService} from "../services/trip.validators";
import {FormGroup, Validators} from "@angular/forms";
import {BATCH_RESERVED_END_COLUMNS, BATCH_RESERVED_START_COLUMNS, BatchesTable, BatchFilter} from "./batches.table";
import {isNil, isNotNil, toFloat, toInt} from "../../shared/shared.module";
import {MethodIds} from "../../referential/services/model";
import {InMemoryTableDataService} from "../../shared/services/memory-data-service.class";
import {environment} from "../../../environments/environment";
import {MeasurementValuesUtils, PMFM_ID_REGEXP} from "../services/model/measurement.model";
import {ModalController} from "@ionic/angular";
import {debounceTime, switchMap, tap} from "rxjs/operators";
import {Observable} from "rxjs";
import {BatchUtils, BatchWeight} from "../services/model/batch.model";
import {isNotEmptyArray, isNotNilOrBlank} from "../../shared/functions";
import {ColumnItem, TableSelectColumnsComponent} from "../../core/table/table-select-columns.component";
import {RESERVED_END_COLUMNS, RESERVED_START_COLUMNS, SETTINGS_DISPLAY_COLUMNS} from "../../core/table/table.class";

const DEFAULT_USER_COLUMNS =["weight", "individualCount"];

@Component({
  selector: 'table-batch-groups',
  templateUrl: 'batch-groups.table.html',
  styleUrls: ['batch-groups.table.scss'],
  providers: [
    {provide: ValidatorService, useClass: BatchGroupsValidatorService}
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BatchGroupsTable extends BatchesTable {


  protected modalCtrl: ModalController;

  weightMethodForm: FormGroup;

  $taxonGroups: Observable<ReferentialRef[]>;
  $taxonNames: Observable<ReferentialRef[]>;

  constructor(
    injector: Injector
  ) {
    super(injector,
      injector.get(ValidatorService),
      new InMemoryTableDataService<Batch, BatchFilter>(Batch, {
        onLoad: (data) => this.onLoad(data),
        onSave: (data) => this.onSave(data),
      })
    );
    this.modalCtrl = injector.get(ModalController);

    // Set default values
    this.showCommentsColumn = false;

  }

  async ngOnInit(): Promise<void> {
    // -- For DEV only
    this.debug = !environment.production;

    await super.ngOnInit();

    // Taxon group combo
    this.$taxonGroups = this.registerCellValueChanges('taxonGroup')
      .pipe(
        debounceTime(250),
        switchMap((value) => this.referentialRefService.suggest(value, {
          entityName: 'TaxonGroup',
          levelId: TaxonGroupIds.FAO,
          searchAttribute: this.fieldsOptions.taxonGroup.searchAttribute
        })),
        // Remember implicit value
        tap(res => this.updateImplicitValue('taxonGroup', res))
      );

    // Taxon name combo
    this.$taxonNames = this.registerCellValueChanges('taxonName')
      .pipe(
        debounceTime(250),
        switchMap((value) => this.referentialRefService.suggest(value, {
          entityName: 'TaxonName',
          levelId: TaxonomicLevelIds.SPECIES,
          searchAttribute: this.fieldsOptions.taxonName.searchAttribute
        })),
        // Remember implicit value
        tap(res => this.updateImplicitValue('taxonName', res))
      );
  }

  onLoad(data: Batch[]): Batch[] {
    if (isNil(this.qvPmfm) || !this.qvPmfm.qualitativeValues) return data; // Skip (pmfms not loaded)

    if (this.debug) console.debug("[batch-group-table] Preparing data to be loaded as table rows...");

    const pmfms = this._initialPmfms;

    let weightMethodValues = this.qvPmfm.qualitativeValues.reduce((res, qv, qvIndex) => {
      res[qvIndex] = false;
      return res;
    }, {});

    // Transform entities into object array
    data = data.map(batch => {
      const measurementValues = {};
      // For each group (one by qualitative value)
      this.qvPmfm.qualitativeValues.forEach((qv, qvIndex) => {
        const child = (batch.children || []).find(c => c.label === `${batch.label}.${qv.label}`);
        if (child) {

          this.getFakeMeasurementValuesFromQvChild(child, measurementValues, qvIndex);

          // Remember method used for the weight (estimated or not)
          if (!weightMethodValues[qvIndex]) {
            if (child.weight && child.weight.estimated) {
              weightMethodValues[qvIndex] = true;
            }
            else if (child.children && child.children.length === 1) {
              const samplingChild = child.children[0];
              weightMethodValues[qvIndex] = samplingChild.weight && samplingChild.weight.estimated;
            }
          }
        }
      });

      // Make entity compatible with reactive form
      batch.measurementValues = measurementValues;
      MeasurementValuesUtils.normalizeFormEntity(batch, pmfms);

      return batch;
    });

    // Set weight is estimated ?
    if (this.weightMethodForm) {
      this.weightMethodForm.patchValue(weightMethodValues);
    }

    return data;
  }


  async onSave(data: Batch[]): Promise<Batch[]> {
    if (isNil(this.qvPmfm) || !this.qvPmfm.qualitativeValues) return data; // Skip (pmfms not loaded)

    if (this.debug) console.debug("[batch-group-table] Preparing data to be saved...");
    const estimatedWeightPmfm = this.weightPmfmsByMethod && this.weightPmfmsByMethod[MethodIds.ESTIMATED_BY_OBSERVER] || this.defaultWeightPmfm;

    data = data.map(batch => {
      const groupColumnValues = batch.measurementValues;
      batch.measurementValues = {};

      batch.children = this.qvPmfm.qualitativeValues.reduce((res, qv, qvIndex: number) => {
        let i = qvIndex * 5;
        const individualCount = toInt(groupColumnValues[i++]);
        const weight = toFloat(groupColumnValues[i++]);
        const samplingRatio = toInt(groupColumnValues[i++]);
        const samplingIndividualCount = toFloat(groupColumnValues[i++]);
        const samplingWeight = toFloat(groupColumnValues[i++]);

        // TODO: compute total weight and nb indiv ?


        const isEstimatedWeight = this.weightMethodForm && this.weightMethodForm.controls[qvIndex].value || false;

        const childLabel = `${batch.label}.${qv.label}`;
        const child: Batch = batch.id && (batch.children || []).find(b => b.label === childLabel) || new Batch();
        child.rankOrder = qvIndex + 1;
        child.measurementValues = {};
        child.measurementValues[this.qvPmfm.pmfmId] = qv.id.toString();
        child.measurementValues[isEstimatedWeight ? estimatedWeightPmfm.pmfmId : this.defaultWeightPmfm.pmfmId] = weight;
        child.individualCount = individualCount;
        child.label = childLabel;

        // If sampling
        if (isNotNil(samplingRatio) || isNotNil(samplingIndividualCount) || isNotNil(samplingWeight)) {
          const samplingLabel = childLabel + Batch.SAMPLE_BATCH_SUFFIX;
          const samplingChild: Batch = child.id && (child.children || []).find(b => b.label === samplingLabel) || new Batch();
          samplingChild.rankOrder = 1;
          samplingChild.label = samplingLabel;
          samplingChild.samplingRatio = isNotNil(samplingRatio) ? samplingRatio / 100 : undefined;
          samplingChild.samplingRatioText = isNotNil(samplingRatio) ? `${samplingRatio}%` : undefined;
          samplingChild.measurementValues = {};
          samplingChild.measurementValues[isEstimatedWeight ? estimatedWeightPmfm.pmfmId : this.defaultWeightPmfm.pmfmId] = samplingWeight;
          samplingChild.individualCount = samplingIndividualCount;
          child.children = [samplingChild];
        }
        // Remove children
        else {
          child.children = [];
        }

        return res.concat(child);
      }, []);

      return batch;
    });

    return data;
  }

  async onSubBatchesClick(event: UIEvent, row: TableElement<Batch>, qvIndex?: number): Promise<void> {
    if (event) event.preventDefault();

    const json = row.currentData;
    let parentBatch = row.validator ? Batch.fromObject(json) : json;

    const defaultBatch = new Batch();
    defaultBatch.parent = parentBatch;

    if (isNotNil(qvIndex) && this.qvPmfm) {
      const qv = this.qvPmfm.qualitativeValues[qvIndex];
      const qvPmfmId = this.qvPmfm.pmfmId.toString();
      defaultBatch.measurementValues[qvPmfmId] = qv.id.toString();
    }

    await this.openSubBatchesModal(defaultBatch);
  }

  /* -- protected methods -- */

  protected normalizeRowMeasurementValues(data: Batch, row: TableElement<Batch>) {
    // When batch has the QV value
    if (this.qvPmfm) {
      const qvId = data.measurementValues[this.qvPmfm.pmfmId];
      if (isNotNilOrBlank(qvId)) {
        const qvIndex = this.qvPmfm.qualitativeValues.findIndex(qv => qv.id === +qvId);
        if (qvIndex !== -1) {
          // Replace measurement values inside a new map, based on fake pmfms
          data.measurementValues = this.getFakeMeasurementValuesFromQvChild(data, {}, qvIndex);
          super.normalizeRowMeasurementValues(data, row);
        }
      }
    }
    else {
      super.normalizeRowMeasurementValues(data, row);
    }

  }

  protected getFakeMeasurementValuesFromQvChild(data: Batch, measurementValues?: {[key: string]: any}, qvIndex?: number): {[key: string]: any} {
    if (!data) return measurementValues; // skip

    if (isNil(qvIndex)) {
      const qvId = this.qvPmfm && data.measurementValues[this.qvPmfm.pmfmId];
      qvIndex = isNotNil(qvId) && this.qvPmfm.qualitativeValues.findIndex(qv => qv.id === +qvId);
      if (qvIndex === -1) throw Error("Invalid batch: no QV value");
    }

    measurementValues = measurementValues || {};
    let i = qvIndex * 5;

    // Column: individual count
    measurementValues[i++] = isNotNil(data.individualCount) ? data.individualCount : null;

    // Column: total weight
    data.weight = this.getWeight(data.measurementValues) || undefined;
    measurementValues[i++] = data.weight && !data.weight.calculated && data.weight.value || null;

    // Sampling batch
    if (data.children && data.children.length === 1) {
      const samplingChild = data.children[0];
      // Column: sampling ratio
      measurementValues[i++] = isNotNil(samplingChild.samplingRatio) ? samplingChild.samplingRatio * 100 : null;

      // Column: sampling individual count
      measurementValues[i++] = isNotNil(samplingChild.individualCount) ? samplingChild.individualCount : null;
      samplingChild.weight = this.getWeight(samplingChild.measurementValues);

      // Column: sampling weight
      measurementValues[i++] = samplingChild.weight && !samplingChild.weight.calculated && samplingChild.weight.value;
    }
    return measurementValues;
  }

  // Override parent function
  protected mapPmfms(pmfms: PmfmStrategy[]): PmfmStrategy[] {
    if (!pmfms || !pmfms.length) return pmfms; // Skip (no pmfms)

    super.mapPmfms(pmfms);

    // Check PMFM
    if (isNil(this.qvPmfm)) {
      throw new Error(`[batch-group-table] table not ready without a root qualitative PMFM`);
    }
    if (this.debug) console.debug('[batch-group-table] First qualitative PMFM found: ' + this.qvPmfm.label);

    if (isNil(this.defaultWeightPmfm) || this.defaultWeightPmfm.rankOrder < this.qvPmfm.rankOrder) {
      throw new Error(`[batch-group-table] Unable to construct the table. First qualitative value PMFM must be define BEFORE any weight PMFM (by rankOrder in PMFM strategy - acquisition level ${this.acquisitionLevel})`);
    }

    // If estimated weight is allow, init a form for weight methods
    if (!this.weightMethodForm && this.weightPmfmsByMethod[MethodIds.ESTIMATED_BY_OBSERVER]) {

      // Create the form, for each QV value
      this.weightMethodForm = this.formBuilder.group(this.qvPmfm.qualitativeValues.reduce((res, qv, index) => {
        res[index] = [false, Validators.required];
        return res;
      }, {}));

      // Listening changes
      this.registerSubscription(
        this.weightMethodForm.valueChanges.subscribe(json => {
          this._dirty = true;
        }));
    }

    const translations = this.translate.instant([
      'TRIP.BATCH.TABLE.TOTAL_INDIVIDUAL_COUNT',
      'TRIP.BATCH.TABLE.TOTAL_WEIGHT',
      'TRIP.BATCH.TABLE.SAMPLING_RATIO',
      'TRIP.BATCH.TABLE.SAMPLING_INDIVIDUAL_COUNT',
      'TRIP.BATCH.TABLE.SAMPLING_WEIGHT']);
    const columnPmfms: PmfmStrategy[] = this.qvPmfm.qualitativeValues.reduce((res, qv, index) => {
      return res.concat(
        [
          // Column on total (nb indiv, weight)
          {
            type: 'integer', label: qv.label + '_TOTAL_INDIVIDUAL_COUNT', id: index,
            name: translations['TRIP.BATCH.TABLE.TOTAL_INDIVIDUAL_COUNT'],
            minValue: 0,
            maxValue: 10000,
            maximumNumberDecimals: 0
          },
          Object.assign({}, this.defaultWeightPmfm, {
            type: 'double', label: qv.label + '_TOTAL_WEIGHT', id: index,
            name: translations['TRIP.BATCH.TABLE.TOTAL_WEIGHT'],
            minValue: 0,
            maxValue: 10000,
            maximumNumberDecimals: 1
          }),
          // Column on sampling (ratio, nb indiv, weight)
          {
            type: 'integer', label: qv.label + '_SAMPLING_RATIO', id: index,
            name: translations['TRIP.BATCH.TABLE.SAMPLING_RATIO'],
            unit: '%',
            minValue: 0,
            maxValue: 100,
            maximumNumberDecimals: 0
          },
          {
            type: 'integer', label: qv.label + '_SAMPLING_INDIVIDUAL_COUNT', id: index,
            name: translations['TRIP.BATCH.TABLE.SAMPLING_INDIVIDUAL_COUNT'],
            minValue: 0,
            maxValue: 1000,
            maximumNumberDecimals: 0
          },
          Object.assign({}, this.defaultWeightPmfm, {
            type: 'double', label: qv.label + '_SAMPLING_WEIGHT', id: index,
            name: translations['TRIP.BATCH.TABLE.SAMPLING_WEIGHT'],
            minValue: 0,
            maxValue: 1000,
            maximumNumberDecimals: 1
          })
        ]
      );
    }, [])
      .map((pmfm, index) => {
        // Set fake pmfmId (as index in array)
        pmfm.pmfmId = index;
        return PmfmStrategy.fromObject(pmfm);
      });

    return columnPmfms;
  }

  protected isEven(pmfm: PmfmStrategy) {
    const qvIndex = Math.trunc(pmfm.pmfmId / 5);
    return (qvIndex % 2 === 0);
  }

  protected isOdd(pmfm: PmfmStrategy) {
    const qvIndex = Math.trunc(pmfm.pmfmId / 5);
    return (qvIndex % 2 !== 0);
  }

  protected getWeight(measurementValues: { [key: string]: any }): BatchWeight | undefined {
    // Use try default method
    let value = measurementValues[this.defaultWeightPmfm.pmfmId];
    if (isNotNil(value)) {
      return {
        value: value,
        estimated: false,
        calculated: false,
        methodId: this.defaultWeightPmfm.methodId
      };
    }
    if (!this.weightPmfmsByMethod) return undefined;

    // Else, try to get estimated
    let weightPmfm = this.weightPmfmsByMethod[MethodIds.ESTIMATED_BY_OBSERVER];
    value = weightPmfm && measurementValues[weightPmfm.pmfmId];
    if (isNotNil(value)) {
      return {
        value: value,
        estimated: true,
        calculated: false,
        methodId: MethodIds.ESTIMATED_BY_OBSERVER
      };
    }

    // Else, try to get calculated
    weightPmfm = this.weightPmfmsByMethod[MethodIds.CALCULATED];
    value = weightPmfm && measurementValues[weightPmfm.pmfmId];
    if (isNotNil(value)) {
      return {
        value: value,
        estimated: false,
        calculated: true,
        methodId: MethodIds.CALCULATED
      };
    }

    return undefined;
  }

  disable() {
    super.disable();
    if (this.weightMethodForm) this.weightMethodForm.disable({onlySelf: true, emitEvent: false});
  }

  enable() {
    super.enable();
    if (this.weightMethodForm) this.weightMethodForm.enable({onlySelf: true, emitEvent: false});
  }

  markAsPristine() {
    super.markAsPristine();
    if (this.weightMethodForm) this.weightMethodForm.markAsPristine({onlySelf: true});
  }

  markAsTouched() {
    super.markAsTouched();
    if (this.weightMethodForm) this.weightMethodForm.markAsTouched({onlySelf: true});
  }

  markAsUntouched() {
    super.markAsUntouched();
    if (this.weightMethodForm) this.weightMethodForm.markAsUntouched({onlySelf: true});
  }

  // Override default pmfms
  updateColumns(pmfms?: PmfmStrategy[]) {
    pmfms = pmfms || this.pmfms.getValue();
    if (!pmfms) return; // Pmfm not loaded: skip

    this.displayedColumns = this.getDisplayColumns();
    if (!this.loading) this.markForCheck();
  }

  protected getUserColumns(): string[] {
    const userColumns = this.settings.getPageSettings(this.settingsId, SETTINGS_DISPLAY_COLUMNS);
    // No user override: use defaults
    return userColumns || DEFAULT_USER_COLUMNS.slice(0);
  }
  protected getDisplayColumns(userColumns?: string[]): string[] {
    userColumns = userColumns || this.getUserColumns();

    const individualCountIndex = userColumns.findIndex(c => c === 'individualCount');
    let weightIndex = userColumns.findIndex(c => c === 'weight');
    weightIndex = (weightIndex !== -1 && individualCountIndex === -1 ? 1 : weightIndex);

    const pmfmColumns = (this.qvPmfm && this.qvPmfm.qualitativeValues || []).reduce((res, qv, index) => {
      let offset = index * 5;

      return res.concat([
        individualCountIndex !== -1 ? (offset + individualCountIndex) : -1,
        weightIndex !== -1 ? (offset + weightIndex) : -1,
        offset + 2,
        individualCountIndex !== -1 ? (offset + 3 + individualCountIndex) : -1,
        weightIndex !== -1 ? (offset + 3 + weightIndex) : -1]);
    }, [])
      // Remove hidden column
      .filter(c => c !== -1)
      .map(colPmfmId => colPmfmId.toString());

    return RESERVED_START_COLUMNS
      .concat(BATCH_RESERVED_START_COLUMNS)
      .concat(pmfmColumns)
      //.concat(this.qvPmfm && this.qvPmfm.qualitativeValues ? ['totalWeight-' + this.qvPmfm.qualitativeValues[0].id] : [])
      .concat(BATCH_RESERVED_END_COLUMNS)
      .concat(RESERVED_END_COLUMNS)
      .filter(name => !this.excludesColumns.includes(name));
  }

  async openSelectColumnsModal() {

    const userColumns = this.getUserColumns();
    const hiddenColumns = DEFAULT_USER_COLUMNS.slice(0)
      .filter(name => userColumns.indexOf(name) == -1);
    const columns = userColumns
      .concat(hiddenColumns)
      .map(name => {
        const label = (name === 'individualCount') ? 'TRIP.BATCH.TABLE.INDIVIDUAL_COUNT' :
          ((name === 'weight') ? 'TRIP.BATCH.TABLE.WEIGHT' : '');
        return {
          name,
          label,
          visible: userColumns.indexOf(name) !== -1
        };
      });

    const modal = await this.modalCtrl.create({
      component: TableSelectColumnsComponent,
      componentProps: {columns: columns}
    });

    // On dismiss
    modal.onDidDismiss()
      .then(async (res) => {
        if (!res || !res.data) return; // CANCELLED
        const columns = res.data;

        // Update columns
        const userColumns = columns && columns.filter(c => c.visible).map(c => c.name) || [];

        // Update user settings
        await this.settings.savePageSetting(this.settingsId, userColumns, SETTINGS_DISPLAY_COLUMNS);

        this.displayedColumns = this.getDisplayColumns(userColumns);

        this.markForCheck();
      });
    return modal.present();
  }
}

