import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  Input,
  OnDestroy,
  OnInit,
  Optional,
  Output,
  ViewChild
} from '@angular/core';
import {isNotNil, PmfmStrategy, Referential} from "../services/trip.model";
import {merge, Observable} from 'rxjs';
import {filter, map, takeUntil, tap} from 'rxjs/operators';
import {EntityUtils, ReferentialRef, referentialToString} from '../../referential/referential.module';
import {ControlValueAccessor, FormControl, FormGroupDirective, NG_VALUE_ACCESSOR, Validators} from '@angular/forms';
import {FloatLabelType, MatSelect} from "@angular/material";


import {SharedValidators} from '../../shared/validator/validators';
import {PlatformService} from "../../core/services/platform.service";
import {isNotEmptyArray, toBoolean} from "../../shared/functions";
import {AppFormUtils, LocalSettingsService} from "../../core/core.module";
import {sort} from "../../core/services/model";

@Component({
  selector: 'mat-form-field-measurement-qv',
  templateUrl: './measurement-qv.form-field.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MeasurementQVFormField),
      multi: true
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeasurementQVFormField implements OnInit, OnDestroy, ControlValueAccessor {

  private _onChangeCallback = (_: any) => {
  };
  private _onTouchedCallback = () => {
  };
  private _implicitValue: ReferentialRef | any;
  private _onDestroy = new EventEmitter(true);
  private _sortedQualitativeValues: ReferentialRef[];

  items: Observable<ReferentialRef[]>;
  onShowDropdown = new EventEmitter<UIEvent>(true);
  mobile = false;

  @Input()
  displayWith: (obj: ReferentialRef | any) => string;

  @Input() pmfm: PmfmStrategy;

  @Input() formControl: FormControl;

  @Input() formControlName: string;

  @Input() placeholder: string;

  @Input() floatLabel: FloatLabelType = "auto";

  @Input() required: boolean;

  @Input() readonly = false;

  @Input() compact = false;

  @Input() clearable = false;

  @Input() tabindex: number;

  @Input() style: 'autocomplete' | 'select' | 'button';

  @Input() searchAttributes: string[];

  @Input() sortAttribute: string;

  @Output('keypress.enter')
  onKeypressEnter: EventEmitter<any> = new EventEmitter<any>();

  @Output()
  onBlur: EventEmitter<FocusEvent> = new EventEmitter<FocusEvent>();

  @ViewChild('matInput') matInput: ElementRef;
  @ViewChild('matSelect') matSelect: MatSelect;

  constructor(
    private platform: PlatformService,
    private settings: LocalSettingsService,
    private cd: ChangeDetectorRef,
    @Optional() private formGroupDir: FormGroupDirective
  ) {
    this.mobile = platform.mobile;

    // Set default style
    this.style = this.mobile ? 'select' : 'autocomplete';
  }

  ngOnInit() {

    this.formControl = this.formControl || this.formControlName && this.formGroupDir && this.formGroupDir.form.get(this.formControlName) as FormControl;
    if (!this.formControl) throw new Error("Missing mandatory attribute 'formControl' or 'formControlName' in <mat-form-field-measurement-qv>.");

    if (!this.pmfm) throw new Error("Missing mandatory attribute 'pmfm' in <mat-qv-field>.");
    this.pmfm.qualitativeValues = this.pmfm.qualitativeValues || [];
    this.required = toBoolean(this.required, this.pmfm.isMandatory);

    this.formControl.setValidators(this.required ? [Validators.required, SharedValidators.entity] : SharedValidators.entity);

    const options = this.settings.getFieldOptions('qualitativeValue', {attributesArray: this.compact ? ['label'] : ['label', 'name']});
    this.searchAttributes = isNotEmptyArray(this.searchAttributes) && this.searchAttributes || options.searchAttribute && [options.searchAttribute] || options.attributesArray;
    this.sortAttribute =  isNotNil(this.sortAttribute) ? this.sortAttribute : options.searchAttribute;

    // Sort values
    this._sortedQualitativeValues = this.pmfm.qualitativeValues.length < 5 ?
      // Keep rankOrder, if less than 5 item (e.g. Landing/Discard - see issue #112)
      sort(this.pmfm.qualitativeValues, 'rankOrder') :
      sort(this.pmfm.qualitativeValues, this.sortAttribute);

    this.placeholder = this.placeholder || this.computePlaceholder(this.pmfm, this._sortedQualitativeValues);
    this.displayWith = this.displayWith || (this.compact ?
      (obj) => obj && obj[this.searchAttributes[0]] :
      (obj) => referentialToString(obj, this.searchAttributes));
    this.clearable = this.compact ? false : this.clearable;

    if (!this.mobile) {
      if (!this._sortedQualitativeValues.length) {
        this.items = Observable.of([]);
      } else {
        this.items = merge(
          this.onShowDropdown
            .pipe(
              takeUntil(this._onDestroy),
              filter(event => !event.defaultPrevented),
              map((_) => this._sortedQualitativeValues)
            ),
          this.formControl.valueChanges
            .pipe(
              takeUntil(this._onDestroy),
              filter(EntityUtils.isEmpty),
              map(value => {
                value = (typeof value === "string") && (value as string).toUpperCase() || undefined;
                if (!value || value === '*') return this._sortedQualitativeValues;

                // Filter by label and name
                return this._sortedQualitativeValues
                  .filter((qv) => this.match(qv, value));
              }),
              // Store implicit value (will use it onBlur if not other value selected)
              tap(res => {
                if (res && res.length === 1) {
                  this._implicitValue = res[0];
                  this.formControl.setErrors(null);
                } else {
                  this._implicitValue = undefined;
                }
              })
            )
        );
      }
    }

    this.updateTabIndex();
  }


  ngOnDestroy(): void {
    this._onDestroy.emit();
  }

  get value(): any {
    return this.formControl.value;
  }

  writeValue(obj: any): void {
    if (obj !== this.formControl.value) {
      this.formControl.patchValue(obj, {emitEvent: false});
      this._onChangeCallback(obj);
    }
  }

  registerOnChange(fn: any): void {
    this._onChangeCallback = fn;
  }

  registerOnTouched(fn: any): void {
    this._onTouchedCallback = fn;
  }

  setDisabledState(isDisabled: boolean): void {

  }

  checkIfTouched() {
    if (this.formControl.touched) {
      this.markForCheck();
      this._onTouchedCallback();
    }
  }

  computePlaceholder(pmfm: PmfmStrategy, sortedQualitativeValues: ReferentialRef[]): string {
    if (!sortedQualitativeValues || !sortedQualitativeValues.length) return pmfm && pmfm.name;
    return sortedQualitativeValues.reduce((res, qv) => (res + "/" + (qv.label || qv.name)), "").substr(1);
  }

  _onBlur(event: FocusEvent) {
    // When leave component without object, use implicit value if stored
    if (typeof this.formControl.value !== "object" && this._implicitValue) {
      this.writeValue(this._implicitValue);
    }
    this.checkIfTouched();
    this.onBlur.emit(event);
  }

  clear() {
    this.formControl.setValue(null);
    this.markForCheck();
  }

  selectInputContent = AppFormUtils.selectInputContent;

  /* -- protected methods -- */

  protected markForCheck() {
    this.cd.markForCheck();
  }

  private match(qv: ReferentialRef, search: string): boolean {
    return this.searchAttributes.findIndex(attr => this.startsWithUpperCase(qv[attr], search)) !== -1;
  }

  private startsWithUpperCase(input: string, search: string): boolean {
    return input && input.toUpperCase().startsWith(search);
  }

  protected updateTabIndex() {
    if (this.tabindex && this.tabindex !== -1) {
      setTimeout(() => {
        if (this.matInput) {
          this.matInput.nativeElement.tabIndex = this.tabindex;
        } else if (this.matSelect) {
          this.matSelect.tabIndex = this.tabindex;
        }
        this.markForCheck();
      });
    }
  }
}
