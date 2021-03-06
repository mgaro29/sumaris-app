import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Injector, Input, OnInit, Output} from '@angular/core';
import {RESERVED_END_COLUMNS, RESERVED_START_COLUMNS} from "../../core/table/table.class";
import {TableElement, ValidatorService} from "angular4-material-table";
import {InMemoryEntitiesService} from "../../shared/services/memory-entity-service.class";
import {environment} from "../../../environments/environment";
import {PmfmStrategyValidatorService} from "../services/validator/pmfm-strategy.validator";
import {AppInMemoryTable} from "../../core/table/memory-table.class";
import {filterNumberInput} from "../../shared/inputs";
import {ReferentialRefService} from "../services/referential-ref.service";
import {FormFieldDefinition, FormFieldDefinitionMap} from "../../shared/form/field.model";
import {Beans, changeCaseToUnderscore, isEmptyArray, isNotEmptyArray, isNotNil, KeysEnum} from "../../shared/functions";
import {BehaviorSubject, Observable, of} from "rxjs";
import {firstFalsePromise} from "../../shared/observables";
import {PmfmService} from "../services/pmfm.service";
import {Pmfm} from "../services/model/pmfm.model";
import {
  IReferentialRef,
  ReferentialRef,
  referentialToString,
  ReferentialUtils
} from "../../core/services/model/referential.model";
import {AppTableDataSourceOptions} from "../../core/table/entities-table-datasource.class";
import {debounceTime, map, startWith, switchMap} from "rxjs/operators";
import {PmfmStrategy} from "../services/model/pmfm-strategy.model";
import {PmfmValueUtils} from "../services/model/pmfm-value.model";
import {Program} from "../services/model/program.model";
import {SelectionChange} from "@angular/cdk/collections";

export class PmfmStrategyFilter {

  static searchFilter<T extends PmfmStrategy>(f: PmfmStrategyFilter): (PmfmStrategy) => boolean {
    if (PmfmStrategyFilter.isEmpty(f)) return undefined; // no filter need
    return (t) => {
      // DEBUG
      //console.debug("Filtering pmfmStrategy: ", t, f);

      // Acquisition Level
      const acquisitionLevel = t.acquisitionLevel && t.acquisitionLevel instanceof ReferentialRef ? t.acquisitionLevel.label : t.acquisitionLevel;
      if (f.acquisitionLevel && (!acquisitionLevel || acquisitionLevel !== f.acquisitionLevel)) {
        return false;
      }

      // Locations
      //if (isNotEmptyArray(f.locationIds) && (isEmptyArray(t.gears) || t.gears.findIndex(id => f.gearIds.includes(id)) === -1)) {
      //    return false;
      //}

      // Gears
      if (isNotEmptyArray(f.gearIds) && (isEmptyArray(t.gearIds) || t.gearIds.findIndex(id => f.gearIds.includes(id)) === -1)) {
        return false;
      }

      // Taxon groups
      if (isNotEmptyArray(f.taxonGroupIds) && (isEmptyArray(t.taxonGroupIds) || t.taxonGroupIds.findIndex(id => f.taxonGroupIds.includes(id)) === -1)) {
        return false;
      }

      // Taxon names
      if (isNotEmptyArray(f.referenceTaxonIds) && (isEmptyArray(t.referenceTaxonIds) || t.referenceTaxonIds.findIndex(id => f.referenceTaxonIds.includes(id)) === -1)) {
        return false;
      }

      return true;
    }
  }

  static isEmpty(aFilter: PmfmStrategyFilter|any): boolean {
    return Beans.isEmpty<PmfmStrategyFilter>(aFilter, PmfmStrategyFilterKeys, {
      blankStringLikeEmpty: true
    });
  }

  strategyId?: number;
  acquisitionLevel?: string;
  gearIds?: number[];
  locationIds?: number[];
  taxonGroupIds?: number[];
  referenceTaxonIds?: number[];
}

export const PmfmStrategyFilterKeys: KeysEnum<PmfmStrategyFilter> = {
  strategyId: true,
  acquisitionLevel: true,
  locationIds: true,
  gearIds: true,
  taxonGroupIds: true,
  referenceTaxonIds: true
};

@Component({
  selector: 'app-pmfm-strategies-table',
  templateUrl: './pmfm-strategies.table.html',
  styleUrls: ['./pmfm-strategies.table.scss'],
  providers: [
    {provide: ValidatorService, useExisting: PmfmStrategyValidatorService}
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PmfmStrategiesTable extends AppInMemoryTable<PmfmStrategy, PmfmStrategyFilter> implements OnInit {


  $selectedPmfms = new BehaviorSubject<PmfmStrategy[]>(undefined);
  $acquisitionLevels = new BehaviorSubject<IReferentialRef[]>(undefined);
  $pmfms = new BehaviorSubject<Pmfm[]>(undefined);
  $gears = new BehaviorSubject<IReferentialRef[]>(undefined);
  $loadingReferential = new BehaviorSubject<boolean>(true);
  $qualitativeValues = new BehaviorSubject<IReferentialRef[]>(undefined);

  fieldDefinitionsMap: FormFieldDefinitionMap = {};
  fieldDefinitions: FormFieldDefinition[] = [];

  @Input() canEdit = false;
  @Input() canDelete = false;
  @Input() sticky = false;

  @Input() title: string;

  @Input() program: Program;

  @Output() get selectionChanges(): Observable<TableElement<PmfmStrategy>[]> {
    return this.selection.changed.pipe(
      map(_ => this.selection.selected)
    );
  }

  constructor(
    protected injector: Injector,
    protected validatorService: ValidatorService,
    protected pmfmService: PmfmService,
    protected referentialRefService: ReferentialRefService,
    protected cd: ChangeDetectorRef
  ) {
    super(injector,
      // columns
      RESERVED_START_COLUMNS
        .concat([
          'acquisitionLevel',
          'rankOrder',
          'pmfm',
          'isMandatory',
          'acquisitionNumber',
          'minValue',
          'maxValue',
          'defaultValue'
        ])
        .concat(RESERVED_END_COLUMNS),
      PmfmStrategy,
      new InMemoryEntitiesService<PmfmStrategy, PmfmStrategyFilter>(PmfmStrategy, {
        onLoad: (data) => this.onLoad(data),
        onSave: (data) => this.onSave(data),
        filterFnFactory: PmfmStrategyFilter.searchFilter
      }),
      validatorService,
      <AppTableDataSourceOptions<PmfmStrategy>>{
        prependNewElements: true,
        suppressErrors: true,
        onRowCreated: (row) => this.onRowCreated(row)
      },
      new PmfmStrategyFilter());

    this.i18nColumnPrefix = 'PROGRAM.STRATEGY.PMFM_STRATEGY.';
    this.inlineEdition = true;
    //this.confirmBeforeDelete = true;

    this.debug = !environment.production;

    // Loading referential items
    this.loadReferential();
  }

  ngOnInit() {
    super.ngOnInit();

    // Acquisition level
    this.registerFormField('acquisitionLevel', {
      type: 'entity',
      required: true,
      autocomplete: this.registerAutocompleteField('acquisitionLevel', {
        items: this.$acquisitionLevels,
        attributes: ['name'],
        showAllOnFocus: true,
        class: 'mat-autocomplete-panel-large-size'
      })
    });

    // Rank order
    this.registerFormField('rankOrder', {
      type: 'integer',
      minValue: 1,
      defaultValue: 1,
      required: true
    });

    // Pmfm
    const basePmfmAttributes = this.settings.getFieldDisplayAttributes('pmfm', ['label', 'name']);
    const pmfmAttributes = basePmfmAttributes
      .map(attr => attr === 'name' ? 'parameter.name' : attr)
      .concat(['unit.label', 'matrix.name', 'fraction.name', 'method.name']);
    const pmfmColumnNames = basePmfmAttributes.map(attr => 'REFERENTIAL.' + attr.toUpperCase())
      .concat(['REFERENTIAL.PMFM.UNIT', 'REFERENTIAL.PMFM.MATRIX', 'REFERENTIAL.PMFM.FRACTION', 'REFERENTIAL.PMFM.METHOD']);
    this.registerFormField('pmfm', {
      type: 'entity',
      required: true,
      autocomplete: this.registerAutocompleteField('pmfm', {
        items: this.$pmfms,
        attributes: pmfmAttributes,
        columnSizes: pmfmAttributes.map(attr => {
          switch(attr) {
            case 'label':
              return 2;
            case 'name':
              return 3;
            case 'unit.label':
              return 1;
            case 'method.name':
              return 4;
            default: return undefined;
          }
        }),
        columnNames: pmfmColumnNames,
        showAllOnFocus: false,
        class: 'mat-autocomplete-panel-full-size'
      })
    });

    // Is mandatory
    this.registerFormField('isMandatory', {
      type: 'boolean',
      defaultValue: false,
      required: true
    });

    // Acquisition number
    this.registerFormField('acquisitionNumber', {
      type: 'integer',
      minValue: 1,
      defaultValue: 1,
      required: true
    });

    // Min / Max
    this.registerFormField('minValue', {
      type: 'double',
      required: false
    });
    this.registerFormField('maxValue', {
      type: 'double',
      required: false
    });
    this.registerFormField('defaultValue', {
      type: 'double',
      required: false
    }, true);

    const qvAttributes = this.settings.getFieldDisplayAttributes('qualitativeValue', ['label', 'name']);
    this.registerFormField('defaultQualitativeValue', {
      type: 'entity',
      autocomplete: {
        attributes: qvAttributes,
        items: this.onStartEditingRow
          .pipe(
            switchMap(row => {
              const control = row.validator && row.validator.get('pmfm');
              if (control) {
                return control.valueChanges.pipe(startWith(control.value))
              } else {
                return of(row.currentData.pmfm);
              }
            }),
            debounceTime(200),
            map(pmfm => isNotEmptyArray(pmfm && pmfm.qualitativeValues) ? pmfm.qualitativeValues : (pmfm.parameter && pmfm.parameter.qualitativeValues || []))
          ),
        showAllOnFocus: false,
        class: 'mat-autocomplete-panel-large-size'
      },
      required: false
    }, true);




  }


  /* -- protected methods -- */

  protected async onLoad(data: PmfmStrategy[]): Promise<PmfmStrategy[]> {

    await this.waitReferentialReady();

    console.debug("[pmfm-strategy-table] Adapt loaded data to table...");

    const acquisitionLevels = this.$acquisitionLevels.getValue();
    const pmfms = this.$pmfms.getValue();
    //const gears = this.$gears.getValue();
    return data.map(source => {
      const target:any = source instanceof PmfmStrategy ? source.asObject() : source;
      target.acquisitionLevel = acquisitionLevels.find(i => i.label === target.acquisitionLevel);

      const pmfm = pmfms.find(i => i.id === target.pmfmId);
      target.pmfm = pmfm;
      delete target.pmfmId;

      if (isNotNil(target.defaultValue)) console.log("TODO check reading default value", target.defaultValue);
      target.defaultValue = PmfmValueUtils.fromModelValue(target.defaultValue, pmfm);

      return target;
    })
  }

  protected async onSave(data: PmfmStrategy[]): Promise<PmfmStrategy[]> {
    console.debug("[pmfm-strategy-table] Saving...");

    // Convert to JSON
    //return data.map(source => source instanceof PmfmStrategy ? source.asObject() : source);

    return data;
  }

  setFilter(source: Partial<PmfmStrategyFilter>, opts?: { emitEvent: boolean }) {
    const target = new PmfmStrategyFilter();
    Object.assign(target, source)
    super.setFilter(target, opts);
  }

  protected async onRowCreated(row: TableElement<PmfmStrategy>): Promise<void> {

    // Creating default values, from the current filter
    const filter = this.filter;
    const acquisitionLevelLabel = filter && filter.acquisitionLevel;
    const acquisitionLevel = acquisitionLevelLabel && (this.$acquisitionLevels.getValue() || []).find(item => item.label === acquisitionLevelLabel);
    const gearIds = filter && filter.gearIds;
    const taxonGroupIds = filter && filter.taxonGroupIds;
    const referenceTaxonIds = filter && filter.referenceTaxonIds;

    let rankOrder:number = null;
    if (acquisitionLevel) {
      rankOrder = ((await this.getMaxRankOrder(acquisitionLevel)) || 0) + 1;
    }
    const defaultValues = {
      acquisitionLevel,
      rankOrder,
      gearIds,
      taxonGroupIds,
      referenceTaxonIds
    }

    // Applying defaults
    if (row.validator) {
      row.validator.patchValue(defaultValues);
    }
    else {
      Object.assign(row.currentData, defaultValues);
    }
  }

  protected async getMaxRankOrder(acquisitionLevel: IReferentialRef): Promise<number> {
    const rows = await this.dataSource.getRows();
    return rows
      .map(row => row.currentData)
      .filter(data => ReferentialUtils.equals(data.acquisitionLevel, acquisitionLevel))
      .reduce((res, data) => Math.max(res, data.rankOrder || 0), 0);
  }

  protected registerFormField(fieldName: string, def: Partial<FormFieldDefinition>, intoMap?: boolean) {
    const definition = <FormFieldDefinition>{
      key: fieldName,
      label: this.i18nColumnPrefix + changeCaseToUnderscore(fieldName).toUpperCase(),
      ...def
    }
    if (intoMap === true) {
      this.fieldDefinitionsMap[fieldName] = definition;
    }
    else {
      this.fieldDefinitions.push(definition);
    }
  }


  protected async waitReferentialReady(): Promise<void> {
    // Wait end of loading referential
    if (this.$loadingReferential.getValue()) {
      await firstFalsePromise(this.$loadingReferential);
    }
  }

  protected async loadReferential() {
    console.debug("[pmfm-strategy-table] Loading referential items...");
    this.markAsLoading();

    this.$loadingReferential.next(true);

    try {
      await Promise.all([
        this.loadAcquisitionLevels(),
        this.loadPmfms(),
        //this.loadGears(),
      ]);

      console.debug("[pmfm-strategy-table] Loaded referential items");
    } catch(err) {
      this.error = err && err.message || err;
      this.markForCheck();
    }
    finally {
      this.$loadingReferential.next(false);
    }
  }

  protected async loadAcquisitionLevels() {
    const res = await this.referentialRefService.loadAll(0, 100, null, null, {
      entityName: 'AcquisitionLevel'
    }, {withTotal: false});
    this.$acquisitionLevels.next(res && res.data || undefined)
  }

  protected async loadPmfms() {
    const res = await this.pmfmService.loadAll(0, 1000, null, null, null,
      {
        withTotal: false,
        withDetails: true
      });
    this.$pmfms.next(res && res.data || [])
  }

  protected async loadGears() {
    const res = await this.referentialRefService.loadAll(0, 1000, null, null, {
        entityName: 'Gear',
        levelId: this.program && this.program.gearClassification && this.program.gearClassification.id
      },
      {
        withTotal: false
      });
    this.$gears.next(res && res.data || []);
  }

  protected startEditingRow() {
    console.log("TODO start edit")
  }

  filterNumberInput = filterNumberInput;
  referentialToString = referentialToString;
  pmfmValueToString = PmfmValueUtils.valueToString;

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
