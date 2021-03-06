import {MeasurementsValidatorOptions, MeasurementsValidatorService} from "./measurement.validator";
import {Injectable} from "@angular/core";
import {FormBuilder, FormGroup} from "@angular/forms";
import {Measurement} from "../model/measurement.model";
import {LocalSettingsService} from "../../../core/services/local-settings.service";
import {ProgramService} from "../../../referential/services/program.service";

@Injectable()
export class ExpenseValidatorService extends MeasurementsValidatorService {

  constructor(
    formBuilder: FormBuilder,
    settings: LocalSettingsService,
    programService: ProgramService
  ) {
    super(formBuilder, settings, programService);
  }

  getFormGroupConfig(data: Measurement[], opts?: MeasurementsValidatorOptions): { [p: string]: any } {
    return Object.assign(
      super.getFormGroupConfig(data, opts),
      {
        calculatedTotal: [null],
        baits: this.getBaitsFormArray()
      }
    );
  }

    protected fillDefaultOptions(opts?: MeasurementsValidatorOptions): MeasurementsValidatorOptions {
    opts = super.fillDefaultOptions(opts);

    // add expense fields as protected attributes
    opts.protectedAttributes.push('calculatedTotal', 'baits');

    return opts;
  }

  getBaitsFormArray() {
    return this.formBuilder.array([this.getBaitControl()]);
  }

  getBaitControl(data?: number): FormGroup {
    return this.formBuilder.group({
      rankOrder: [data || 1]
    });
  }
}
