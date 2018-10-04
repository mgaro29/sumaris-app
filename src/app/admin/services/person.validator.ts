import { Injectable } from "@angular/core";
import { ValidatorService } from "angular4-material-table";
import { FormControl, FormGroup, Validators } from "@angular/forms";
import { Person } from "./model";
import { AccountService, AccountValidatorService } from "../../core/core.module";
import { getMainProfile, StatusIds } from "../../core/services/model";
import { SharedValidators } from "../../shared/validator/validators";

@Injectable()
export class PersonValidatorService extends AccountValidatorService {

  constructor(
    accountService: AccountService
  ) {
    super(accountService);
  }

  getRowValidator(): FormGroup {
    return this.getFormGroup();
  }

  getFormGroup(data?: Person): FormGroup {

    // note: Person validator is more FLEXIBLE than AccountValidator
    // Optional fields are: pubkey, profile...  
    // This is need to be able to store person that are not using SUMARiS tool (e.g. onboard obsevers)

    const formDef = {
      'id': new FormControl(),
      'lastName': new FormControl(data && data.lastName || null, Validators.compose([Validators.required, Validators.minLength(2)])),
      'firstName': new FormControl(data && data.firstName || null, Validators.compose([Validators.required, Validators.minLength(2)])),
      'email': new FormControl(data && data.email || null, Validators.compose([Validators.required, Validators.email])),
      'mainProfile': new FormControl(data && (data.mainProfile || getMainProfile(data.profiles)) || 'GUEST', Validators.required),
      'statusId': new FormControl(data && data.statusId || StatusIds.TEMPORARY, Validators.required),
      'pubkey': new FormControl(data && data.pubkey || null, SharedValidators.pubkey)
    };

    // Add additional fields (department, etc.)
    this.accountService.additionalAccountFields.forEach(field => {
      formDef[field.name] = new FormControl(data && data[field.name] || null, this.getValidators(field));
    });

    return new FormGroup(formDef);
  }


}