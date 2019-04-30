import {NgModule} from "@angular/core";
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {
  MatAutocompleteModule,
  MatButtonModule,
  MatButtonToggleModule,
  MatCardModule,
  MatCheckboxModule,
  MatDialogModule,
  MatExpansionModule,
  MatFormFieldModule,
  MatIconModule,
  MatInputModule,
  MatListModule,
  MatMenuModule,
  MatPaginatorModule,
  MatProgressBarModule,
  MatProgressSpinnerModule,
  MatRadioModule,
  MatSelectModule,
  MatSortModule,
  MatStepperModule,
  MatTableModule,
  MatTabsModule,
  MatToolbarModule
} from "@angular/material";
import {CdkTableModule} from "@angular/cdk/table";
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatMomentDateModule} from '@angular/material-moment-adapter';

import {fadeInAnimation, slideInOutAnimation} from './material.animations';
import {NgxMaterialTimepickerModule} from "ngx-material-timepicker";

const modules: any[] = [
  MatTableModule,
  MatSortModule,
  MatAutocompleteModule,
  MatPaginatorModule,
  BrowserAnimationsModule,
  MatFormFieldModule,
  MatInputModule,
  CdkTableModule,
  MatDatepickerModule,
  MatMomentDateModule,
  MatCheckboxModule,
  MatExpansionModule,
  MatToolbarModule,
  MatDialogModule,
  MatIconModule,
  MatButtonModule,
  MatMenuModule,
  MatSelectModule,
  MatCardModule,
  MatTabsModule,
  MatListModule,
  MatStepperModule,
  MatButtonToggleModule,
  MatProgressSpinnerModule,
  MatProgressBarModule,
  MatRadioModule
];

@NgModule({
  imports: modules,
  exports: modules
})
export class MaterialModule {
}

export { fadeInAnimation, slideInOutAnimation }
