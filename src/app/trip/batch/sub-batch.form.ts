import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren
} from "@angular/core";
import {ValidatorService} from "angular4-material-table";
import {Batch, BatchUtils} from "../services/model/batch.model";
import {MeasurementValuesForm} from "../measurement/measurement-values.form.class";
import {DateAdapter} from "@angular/material";
import {Moment} from "moment";
import {MeasurementsValidatorService} from "../services/measurement.validator";
import {AbstractControl, FormArray, FormBuilder, FormGroup, Validators} from "@angular/forms";
import {ProgramService} from "../../referential/services/program.service";
import {ReferentialRefService} from "../../referential/services/referential-ref.service";
import {SubBatchValidatorService} from "../services/sub-batch.validator";
import {
  AcquisitionLevelCodes, attributeComparator,
  EntityUtils,
  IReferentialRef,
  referentialToString,
  UsageMode
} from "../../core/services/model";
import {debounceTime, distinctUntilChanged, filter, map, mergeMap, startWith, tap} from "rxjs/operators";
import {getPmfmName, isNil, isNotNil, PmfmStrategy} from "../../referential/services/model";
import {merge, Observable} from "rxjs";
import {getPropertyByPath, isNilOrBlank, startsWithUpperCase} from "../../shared/functions";
import {LocalSettingsService} from "../../core/services/local-settings.service";
import {environment} from "../../../environments/environment";
import {MeasurementValuesUtils} from "../services/model/measurement.model";
import {PlatformService} from "../../core/services/platform.service";
import {AppFormUtils} from "../../core/core.module";
import {MeasurementFormField} from "../measurement/measurement.form-field.component";
import {MeasurementQVFormField} from "../measurement/measurement-qv.form-field.component";
import {MatAutocompleteField} from "../../shared/material/material.autocomplete";
import {InputElement, isInputElement} from "../../shared/material/focusable";


@Component({
  selector: 'app-sub-batch-form',
  templateUrl: 'sub-batch.form.html',
  providers: [
    {provide: ValidatorService, useExisting: SubBatchValidatorService}
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubBatchForm extends MeasurementValuesForm<Batch>
  implements OnInit, OnDestroy {

  protected _initialPmfms: PmfmStrategy[];
  protected _qvPmfm: PmfmStrategy;
  protected _availableParents: Batch[] = [];
  protected _parentAttributes: string[];

  mobile: boolean;
  enableIndividualCountControl: AbstractControl;

  @Input() tabindex: number;

  @Input() usageMode: UsageMode;

  @Input() showParent = true;

  @Input() showTaxonName = true;

  @Input() showIndividualCount = true;

  @Input() displayParentPmfm: PmfmStrategy;

  @Input() onNewParentClick: () => Promise<Batch | undefined>;

  @Input() showError = true;

  @Input() set qvPmfm(value: PmfmStrategy) {
    this._qvPmfm = value;
    // If already loaded, re apply pmfms, to be able to execute mapPmfms
    if (value && !this.loadingPmfms) {
      this.setPmfms(this.$pmfms);
    }
  };

  get qvPmfm(): PmfmStrategy {
    return this._qvPmfm;
  };

  @Input() set availableParents(parents: Batch[]) {
    if (this._availableParents === parents) return; // skip
    this._availableParents = parents;
  }

  get availableParents(): Batch[] {
    return this._availableParents;
  }

  get isOnFieldMode(): boolean {
    return this.usageMode ? this.usageMode === 'FIELD' : this.settings.isUsageMode('FIELD');
  }

  get enableIndividualCount(): boolean {
    return this.enableIndividualCountControl.value;
  }

  @ViewChildren(MeasurementFormField) measurementFormFields: QueryList<MeasurementFormField>;
  @ViewChildren('matInput') matInputs: QueryList<ElementRef>;

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected measurementValidatorService: MeasurementsValidatorService,
    protected formBuilder: FormBuilder,
    protected programService: ProgramService,
    protected cd: ChangeDetectorRef,
    protected validatorService: ValidatorService,
    protected referentialRefService: ReferentialRefService,
    protected settings: LocalSettingsService,
    protected platform: PlatformService
  ) {
    super(dateAdapter, measurementValidatorService, formBuilder, programService, settings, cd,
      validatorService.getRowValidator(),
      {
        mapPmfms: (pmfms) => this.mapPmfms(pmfms),
        onUpdateControls: (form) => this.onUpdateControls(form)
      });

    this.mobile = platform.mobile;

    // Set default values
    this._acquisitionLevel = AcquisitionLevelCodes.SORTING_BATCH_INDIVIDUAL;

    // Control for indiv. count enable
    this.enableIndividualCountControl = this.formBuilder.control(this.mobile, Validators.required);
    this.enableIndividualCountControl.setValue(false, {emitEvent: false});

    // Get display attributes for parent
    this._parentAttributes = this.settings.getFieldDisplayAttributes('taxonGroup').map(attr => 'taxonGroup.' + attr)
      .concat(!this.showTaxonName ? this.settings.getFieldDisplayAttributes('taxonName').map(attr => 'taxonName.' + attr) : []);

    // For DEV only
    this.debug = !environment.production;
  }

  ngOnInit() {
    super.ngOnInit();

    // Parent combo
    this.registerAutocompleteConfig('parent', {
      suggestFn: (value: any, options?: any) => this.suggestParents(value, options),
      attributes: ['rankOrder'].concat(this._parentAttributes)
    });

    // Taxon combo
    this.registerAutocompleteConfig('taxonName', {
      suggestFn: (value: any, options?: any) => this.suggestTaxonNames(value, options),
      showAllOnFocus: true
    });

    this.tabindex = isNotNil(this.tabindex) ? this.tabindex : 1;

    const parentControl = this.form.get('parent');
    const taxonNameControl = this.form.get('taxonName');


    // Reset taxon name combo when parent changed
    this.registerSubscription(
      parentControl.valueChanges
        .pipe(
          debounceTime(250),
          filter(EntityUtils.isNotEmpty),
          map(parent => parent.label),
          distinctUntilChanged()
        )
        .subscribe((value) => {
          taxonNameControl.patchValue(null, {emitEVent: false});
          taxonNameControl.markAsPristine({onlySelf: true});
        }));

    this.registerSubscription(
      this.enableIndividualCountControl.valueChanges
        .pipe(startWith(this.enableIndividualCountControl.value))
        .subscribe((enable) => {
          if (enable) {
            this.form.get('individualCount').enable();
            this.form.get('individualCount').setValidators(Validators.compose([Validators.required, Validators.min(0)]));
          } else {
            this.form.get('individualCount').disable();
            this.form.get('individualCount').setValue(null);
          }
        }));

    this.updateTabIndex();
  }

  async doNewParentClick(event: UIEvent) {
    if (!this.onNewParentClick) return;
    const res = await this.onNewParentClick();

    if (res && res instanceof Batch) {
      this.form.get('parent').setValue(res);
    }
  }

  doSubmitIfEnter(event: KeyboardEvent): boolean{
    if (event.keyCode == 13) {
      this.doSubmit(event);
      return false;
    }
    return true;
  }

  focusFirstEmpty(event?: UIEvent) {
    // Focus to first input
    this.matInputs
      .map((input) => {
        if (isInputElement(input)) {
          return input;
        } else if (isInputElement(input.nativeElement)) {
          return input.nativeElement;
        }
        return undefined;
      })
      .filter(input => isNotNil(input) && isNilOrBlank(input.value))
      // FIXME: this is not working (la fonction d'après ne recupère rien)
      //.sort(attributeComparator("tabindex")) // Order by tabindex
      .sort((a, b) => {
        const valueA = a.tabindex || a.tabIndex;
        const valueB = b.tabindex || b.tabIndex;
        return valueA === valueB ? 0 : (valueA > valueB ? 1 : -1);
      })
      .find(input => {
        input.focus();
        return true; // stop
      });
  }

  doSubmitLastMeasurementField(event: KeyboardEvent) {
    if (!this.enableIndividualCount) {
      this.doSubmit(event);
    }
    else {
      // Focus to last (=individual count input)
      this.matInputs.last.nativeElement.focus();
    }
  }

  setValue(data: Batch) {
    // Replace parent with value of availableParents
    this.linkToParent(data);

    // Inherited method
    super.setValue(data);
  }

  enable(opts?: { onlySelf?: boolean; emitEvent?: boolean }): void {
    super.enable(opts);

    if (!this.enableIndividualCount) {
      this.form.get('individualCount').disable(opts);
    }
  }

  parentToString(batch: Batch) {
    // TODO: use attributes from settings ?
    return BatchUtils.parentToString(batch);
  }

  referentialToString = referentialToString;
  getPmfmName = getPmfmName;
  selectInputContent = AppFormUtils.selectInputContent;
  filterNumberInput = AppFormUtils.filterNumberInput;


  /* -- protected method -- */

  protected async suggestParents(value: any, options?: any): Promise<Batch[]> {
    // Has select a valid parent: return the parent
    if (EntityUtils.isNotEmpty(value)) return [value];
    value = (typeof value === "string" && value !== "*") && value || undefined;
    if (isNilOrBlank(value)) return this._availableParents; // All
    const ucValueParts = value.trim().toUpperCase().split(" ", 1);
    if (this.debug) console.debug(`[sub-batch-table] Searching parent {${value || '*'}}...`);
    // Search on attributes
    return this._availableParents.filter(parent => ucValueParts
        .filter(valuePart => this._parentAttributes
          .findIndex(attr => startsWithUpperCase(getPropertyByPath(parent, attr), valuePart.trim())) !== -1
        ).length === ucValueParts.length
    );
  }

  protected suggestTaxonNames(value: any, options?: any): Promise<IReferentialRef[]> {
    const parent = this.form && this.form.get('parent').value;
    if (isNilOrBlank(value) && isNil(parent)) return Promise.resolve([]);
    return this.programService.suggestTaxonNames(value,
      {
        program: this.program,
        searchAttribute: options && options.searchAttribute,
        taxonGroupId: parent && parent.taxonGroup && parent.taxonGroup.id || undefined
      });
  }

  protected mapPmfms(pmfms: PmfmStrategy[]) {

    if (this._qvPmfm) {
      // Remove QV pmfms
      const index = pmfms.findIndex(pmfm => pmfm.pmfmId === this._qvPmfm.pmfmId);
      if (index !== -1) {
        const qvPmfm = this._qvPmfm.clone();
        qvPmfm.hidden = true;
        pmfms[index] = qvPmfm;
      }
    }

    return pmfms;
  }

  protected onUpdateControls(form: FormGroup) {
    if (this._qvPmfm) {
      const measFormGroup = form.get('measurementValues') as FormGroup;
      const qvControl = measFormGroup.get(this._qvPmfm.pmfmId.toString());

      // Make sure QV is required
      qvControl.setValidators(Validators.required);

      this.registerSubscription(qvControl.valueChanges.subscribe((value) => {
        if (!this.data) return;

        console.log("TODO check QV value changes :", value);


      }));
    }

  }

  protected getValue(): Batch {

    const json = this.form.value;
    const pmfmForm = this.form.get('measurementValues');

    // Adapt measurement values for entity
    if (pmfmForm) {
      json.measurementValues = Object.assign({},
        this.data.measurementValues || {}, // Keep additionnal PMFM values
        MeasurementValuesUtils.normalizeValuesToModel(pmfmForm.value, this._initialPmfms || []));
    } else {
      json.measurementValues = {};
    }

    this.data.fromObject(json);

    return this.data;
  }


  protected linkToParent(value: Batch) {
    // Find the parent
    const entityParent = value.parent || (value.parentId && {id: value.parentId});
    if (!entityParent) return; // no parent = nothing to link

    let formParent = this._availableParents.find(p => (p.label === value.parent.label) || (p.id === value.parentId));

    if (!formParent.hasTaxonNameOrGroup && formParent.parent && formParent.parent.hasTaxonNameOrGroup) {
      formParent = formParent.parent;
    }

    if (formParent !== entityParent) {
      this.form.get('parent').patchValue(formParent, {emitEvent: !this.loading});
      if (!this.loading) this.markForCheck();
    }
  }

  protected async updateTabIndex() {
    if (this.tabindex && this.tabindex !== -1) {
      setTimeout(async () => {
        // Make sure form is ready
        await this.onReady();

        let tabindex = this.tabindex;
        this.matInputs.forEach(input => {
          if (input instanceof MeasurementFormField
            || input instanceof MeasurementQVFormField
            || input instanceof MatAutocompleteField) {
            input.tabindex = tabindex;
          }
          else if (input.nativeElement instanceof HTMLInputElement){
            input.nativeElement.setAttribute('tabindex', tabindex.toString());
          }
          else {
            console.warn("Could not set tabindex on element: ", input);
          }
          tabindex = tabindex + 10;
        });
        this.markForCheck();
      });
    }
  }

}
