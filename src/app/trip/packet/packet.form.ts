import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewChild} from "@angular/core";
import {AppForm} from "../../core/form/form.class";
import {Packet, PacketComposition, PacketUtils} from "../services/model/packet.model";
import {EntityUtils, IReferentialRef, UsageMode} from "../../core/services/model";
import {DateAdapter} from "@angular/material";
import {Moment} from "moment";
import {LocalSettingsService} from "../../core/services/local-settings.service";
import {PacketValidatorService} from "../services/validator/packet.validator";
import {FormArrayHelper} from "../../core/form/form.utils";
import {AbstractControl, FormArray, FormBuilder, FormGroup} from "@angular/forms";
import {ProgramService} from "../../referential/services/program.service";
import {isNotNilOrNaN, round} from "../../shared/functions";

@Component({
  selector: 'app-packet-form',
  templateUrl: './packet.form.html',
  styleUrls: ['./packet.form.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PacketForm extends AppForm<Packet> implements OnInit, OnDestroy {

  private readonly indexes = [1, 2, 3, 4, 5, 6];
  computing = false;

  compositionHelper: FormArrayHelper<PacketComposition>;
  compositionFocusIndex = -1;

  get compositionsForm(): FormArray {
    return this.form.controls.composition as FormArray;
  }

  private _program: string;

  @Input()
  set program(value: string) {
    this._program = value;
  }

  get program(): string {
    return this._program;
  }

  mobile: boolean;

  @Input() showError = true;
  @Input() usageMode: UsageMode;

  get isOnFieldMode(): boolean {
    return this.usageMode ? this.usageMode === 'FIELD' : this.settings.isUsageMode('FIELD');
  }

  // get dirty(): boolean {
  //   return (this.form && this.form.dirty) || this.compositionTable.dirty;
  // }

  // @ViewChild('compositionTable', {static: true}) compositionTable: PacketCompositionTable;

  get value(): any {
    const json = this.form.value;

    // Add composition
    // json.composition = (this.compositionTable.value || []).map(c => c.asObject());

    return json;
  }

  constructor(
    protected dateAdapter: DateAdapter<Moment>,
    protected validatorService: PacketValidatorService,
    protected settings: LocalSettingsService,
    protected cd: ChangeDetectorRef,
    protected formBuilder: FormBuilder,
    protected programService: ProgramService
  ) {
    super(dateAdapter, validatorService.getFormGroup(undefined, {withComposition: true}), settings);

  }

  ngOnInit() {
    super.ngOnInit();

    this.initCompositionHelper();


    this.usageMode = this.usageMode || this.settings.usageMode;

    this.registerAutocompleteField('taxonGroup', {
      suggestFn: (value: any, options?: any) => this.suggestTaxonGroups(value, options)
    });


    // this.registerSubscription(this.form.controls.number.valueChanges.subscribe(() => {
    //   this.computeTotalWeight();
    //   this.computeTaxonGroupWeight();
    // }));
    //
    // this.registerSubscription(this.form.controls.composition.valueChanges.subscribe(() => {
    //   this.computeSampledRatios();
    //   this.computeTaxonGroupWeight();
    // }));

  }

  protected async suggestTaxonGroups(value: any, options?: any): Promise<IReferentialRef[]> {
    return this.programService.suggestTaxonGroups(value,
      {
        program: this.program,
        searchAttribute: options && options.searchAttribute
      });
  }

  setValue(data: Packet, opts?: { emitEvent?: boolean; onlySelf?: boolean }) {

    if (!data) return;

    data.composition = data.composition && data.composition.length ? data.composition : [null];
    this.compositionHelper.resize(Math.max(1, data.composition.length));


    super.setValue(data, opts);

    this.computeSampledRatios();
    this.computeTaxonGroupWeight();

    this.registerSubscription(this.form.controls.number.valueChanges.subscribe(() => {
      this.computeTotalWeight();
      this.computeTaxonGroupWeight();
    }));

    for (const i of this.indexes) {
      this.registerSubscription(this.form.controls['sampledWeight' + i].valueChanges.subscribe(() => {
        this.computeTotalWeight();
        this.computeTaxonGroupWeight();
      }));
    }

    this.registerSubscription(this.form.controls.composition.valueChanges.subscribe(() => {
      this.computeSampledRatios();
      this.computeTaxonGroupWeight();
    }));

  }

  computeSampledRatios() {
    if (this.computing)
      return;

    try {
      this.computing = true;
      const compositions: any[] = this.form.controls.composition.value || [];
      for (const i of this.indexes) {
        const ratio = compositions.reduce((sum, current) => sum + current['ratio' + i], 0);
        this.form.controls['sampledRatio' + i].setValue(ratio > 0 ? ratio : null);
      }
    } finally {
      this.computing = false;
    }
  }

  computeTaxonGroupWeight() {
    if (this.computing)
      return;

    try {
      this.computing = true;
      const totalWeight = this.form.controls.weight.value || 0;
      const compositions: FormGroup[] = this.asFormGroups(this.asFormGroup(this.form.controls.composition).controls) || [];

      for (const composition of compositions) {
        const ratios: number[] = [];
        for (const i of this.indexes) {
          const ratio = composition.controls['ratio' + i].value;
          if (isNotNilOrNaN(ratio))
            ratios.push(ratio);
        }
        const sum = ratios.reduce((a, b) => a + b, 0);
        const avg = (sum / ratios.length) || 0;
        composition.controls.weight.setValue(round(avg / 100 * totalWeight));
      }
    } finally {
      this.computing = false;
    }

  }

  computeTotalWeight() {
    if (this.computing)
      return;

    try {
      this.computing = true;
      const sampledWeights: number[] = [];
      for (const i of this.indexes) {
        const weight = this.form.controls['sampledWeight' + i].value;
        if (isNotNilOrNaN(weight))
          sampledWeights.push(weight);
      }
      const sum = sampledWeights.reduce((a, b) => a + b, 0);
      const avg = (sum / sampledWeights.length) || 0;
      const number = this.form.controls.number.value || 0;
      this.form.controls.weight.setValue(round(avg * number));
    } finally {
      this.computing = false;
    }
  }

  initCompositionHelper() {
    this.compositionHelper = new FormArrayHelper<PacketComposition>(
      this.formBuilder,
      this.form,
      'composition',
      (composition) => this.validatorService.getCompositionControl(composition),
      PacketUtils.isPacketCompositionEquals,
      PacketUtils.isPacketCompositionEmpty,
      {
        allowEmptyArray: false
      }
    );
    if (this.compositionHelper.size() === 0) {
      // add at least one composition
      this.compositionHelper.resize(1);
    }
    this.markForCheck();
  }

  addComposition() {
    this.compositionHelper.add();
    if (!this.mobile) {
      this.compositionFocusIndex = this.compositionHelper.size() - 1;
    }
  }

  asFormGroup(control): FormGroup {
    return control;
  }

  asFormGroups(control): FormGroup[] {
    return control;
  }

  protected markForCheck() {
    this.cd.markForCheck();
  }
}
