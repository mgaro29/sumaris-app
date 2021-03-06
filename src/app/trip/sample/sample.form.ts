import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit} from "@angular/core";
import {MeasurementValuesForm} from "../measurement/measurement-values.form.class";
import {DateAdapter} from "@angular/material/core";
import {Moment} from "moment";
import {MeasurementsValidatorService} from "../services/validator/measurement.validator";
import {FormBuilder} from "@angular/forms";
import {ProgramService} from "../../referential/services/program.service";
import {ReferentialRefService} from "../../referential/services/referential-ref.service";
import {IReferentialRef, referentialToString} from "../../core/services/model/referential.model";
import {UsageMode} from "../../core/services/model/settings.model";
import {AcquisitionLevelCodes} from "../../referential/services/model/model.enum";
import {LocalSettingsService} from "../../core/services/local-settings.service";
import {environment} from "../../../environments/environment";
import {AppFormUtils, isNil, isNotNil} from "../../core/core.module";
import {isNilOrBlank} from "../../shared/functions";
import {PlatformService} from "../../core/services/platform.service";
import {SampleValidatorService} from "../services/validator/sample.validator";
import {Sample} from "../services/model/sample.model";
import {PmfmStrategy} from "../../referential/services/model/pmfm-strategy.model";

@Component({
  selector: 'app-sample-form',
  templateUrl: 'sample.form.html',
  styleUrls: ['sample.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SampleForm extends MeasurementValuesForm<Sample>
  implements OnInit, OnDestroy {

  mobile: boolean;

  focusFieldName: string;

  @Input() tabindex: number;
  @Input() usageMode: UsageMode;
  @Input() showLabel = true;
  @Input() showTaxonGroup = true;
  @Input() showTaxonName = true;
  @Input() showComment = true;
  @Input() showError = true;

  @Input() mapPmfmFn: (pmfms: PmfmStrategy[]) => PmfmStrategy[];

  get isOnFieldMode(): boolean {
    return this.usageMode ? this.usageMode === 'FIELD' : this.settings.isUsageMode('FIELD');
  }

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected measurementValidatorService: MeasurementsValidatorService,
    protected formBuilder: FormBuilder,
    protected programService: ProgramService,
    protected platform: PlatformService,
    protected cd: ChangeDetectorRef,
    protected validatorService: SampleValidatorService,
    protected referentialRefService: ReferentialRefService,
    protected settings: LocalSettingsService
  ) {
    super(dateAdapter, measurementValidatorService, formBuilder, programService, settings, cd,
      validatorService.getFormGroup()
    );
    this.mobile = platform.mobile;

    // Set default acquisition level
    this._acquisitionLevel = AcquisitionLevelCodes.SAMPLE;
    this._enable = true;

    // for DEV only
    this.debug = !environment.production;
  }

  ngOnInit() {
    super.ngOnInit();

    this.tabindex = isNotNil(this.tabindex) ? this.tabindex : 1;

    // Taxon group combo
    this.registerAutocompleteField('taxonGroup', {
      suggestFn: (value: any, options?: any) => this.suggestTaxonGroups(value, options),
      mobile: this.mobile
    });
    // Taxon name combo
    this.registerAutocompleteField('taxonName', {
      suggestFn: (value: any, options?: any) => this.suggestTaxonNames(value, options),
      mobile: this.mobile
    });

    this.focusFieldName = !this.mobile && ((this.showLabel && 'label')
      || (this.showTaxonGroup && 'taxonGroup')
      || (this.showTaxonName && 'taxonName'));
  }

  /* -- protected methods -- */

  protected async suggestTaxonGroups(value: any, options?: any): Promise<IReferentialRef[]> {
    return this.programService.suggestTaxonGroups(value,
      {
        program: this.program,
        searchAttribute: options && options.searchAttribute
      });
  }

  protected async suggestTaxonNames(value: any, options?: any): Promise<IReferentialRef[]> {
    const taxonGroup = this.form.get('taxonGroup').value;

    // IF taxonGroup column exists: taxon group must be filled first
    if (this.showTaxonGroup && isNilOrBlank(value) && isNil(parent)) return [];

    return this.programService.suggestTaxonNames(value,
      {
        program: this.program,
        searchAttribute: options && options.searchAttribute,
        taxonGroupId: taxonGroup && taxonGroup.id || undefined
      });
  }

  referentialToString = referentialToString;
  selectInputContent = AppFormUtils.selectInputContent;

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
