import {Injectable} from "@angular/core";
import {FormArray, FormBuilder, FormControl, FormGroup, Validators} from "@angular/forms";
import {toBoolean} from "../../../shared/functions";
import {SharedFormArrayValidators, SharedValidators} from "../../../shared/validator/validators";
import {LocalSettingsService} from "../../../core/services/local-settings.service";
import {VesselActivity} from "../model/aggregated-landing.model";
import {ValidatorService} from "angular4-material-table";
import {DataEntityValidatorOptions} from "../../../data/services/validator/data-entity.validator";
import {ReferentialRef} from "../../../core/services/model/referential.model";
import {MeasurementsValidatorService} from "./measurement.validator";

export interface VesselActivityValidatorOptions extends DataEntityValidatorOptions {
  required?: boolean;
}

@Injectable()
export class VesselActivityValidatorService<T extends VesselActivity = VesselActivity, O extends VesselActivityValidatorOptions = VesselActivityValidatorOptions>
  implements ValidatorService {

  constructor(
    protected formBuilder: FormBuilder,
    protected settings: LocalSettingsService
  ) {
  }

  getRowValidator(opts?: O) {
    return this.getFormGroup();
  }

  getFormGroup(data?: T, opts?: O): FormGroup {
    opts = this.fillDefaultOptions(opts);

    return this.formBuilder.group(
      this.getFormGroupConfig(data, opts),
      this.getFormGroupOptions(data, opts)
    );
  }

  getFormGroupConfig(data?: T, opts?: O): { [p: string]: any } {
    opts = this.fillDefaultOptions(opts);

    return {
      __typename: [VesselActivity.TYPENAME],
      date: [data && data.date, Validators.compose([Validators.required, SharedValidators.validDate])],
      rankOrder: [data && data.rankOrder, Validators.compose([Validators.required, SharedValidators.integer])],
      comments: [data && data.comments, Validators.maxLength(2000)],
      measurementValues: this.getMeasurementGroup(data),
      metiers: this.getMetiersFormArray(data, opts),
      tripId: [data && data.tripId]
    };
  }

  getFormGroupOptions(data?: T, opts?: O): {
    [key: string]: any;
  } {
    return {};
  }

  getMeasurementGroup(data?: T): FormGroup {
    const config = data && data.measurementValues && Object.keys(data.measurementValues)
        .reduce((res, pmfmId) => {
          res[pmfmId] = [data.measurementValues[pmfmId]];
          return res;
        }, {})
      || {};
    return this.formBuilder.group(config);
  }


  protected fillDefaultOptions(opts?: O): O {
    opts = opts || {} as O;

    opts.required = toBoolean(opts.required, false);

    return opts;
  }


  private getMetiersFormArray(data: VesselActivity, opts: O): FormArray {
    return this.formBuilder.array(
      (data && data.metiers || []).map(metier => this.getMetierFormControl(metier, opts)),
      SharedFormArrayValidators.requiredArrayMinLength(1)
    );
  }

  public getMetierFormControl(data: ReferentialRef, opts?: O): FormControl {
    opts = this.fillDefaultOptions(opts);
    return this.formBuilder.control(data || null, opts.required ? [Validators.required, SharedValidators.entity] : SharedValidators.entity);
  }
}
