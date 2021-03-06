import {NgModule} from "@angular/core";
import {CommonModule} from "@angular/common";
import {TranslateModule} from "@ngx-translate/core";
import {IonicModule} from "@ionic/angular";
import {DateFormatPipe} from "./date-format.pipe";
import {DateDiffDurationPipe} from "./date-diff-duration.pipe";
import {DateFromNowPipe} from "./date-from-now.pipe";
import {LatitudeFormatPipe, LatLongFormatPipe, LongitudeFormatPipe} from "./latlong-format.pipe";
import {NumberFormatPipe} from "./number-format.pipe";
import {HighlightPipe} from "./highlight.pipe";
import {FileSizePipe} from "./file-size.pipe";
import {DurationPipe} from "./duration.pipe";
import {MathAbsPipe} from "./math-abs.pipe";


@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    TranslateModule.forChild()
  ],
  declarations: [
    DateFormatPipe,
    DateDiffDurationPipe,
    DurationPipe,
    DateFromNowPipe,
    LatLongFormatPipe,
    LatitudeFormatPipe,
    LongitudeFormatPipe,
    HighlightPipe,
    NumberFormatPipe,
    FileSizePipe,
    MathAbsPipe
  ],
  exports: [
    DateFormatPipe,
    DateFromNowPipe,
    DateDiffDurationPipe,
    DurationPipe,
    LatLongFormatPipe,
    LatitudeFormatPipe,
    LongitudeFormatPipe,
    HighlightPipe,
    NumberFormatPipe,
    FileSizePipe,
    MathAbsPipe
  ],
  providers: [
    DateFormatPipe,
    DateFromNowPipe,
    DateDiffDurationPipe,
    LatLongFormatPipe,
    LatitudeFormatPipe,
    LongitudeFormatPipe,
    HighlightPipe,
    NumberFormatPipe
  ]
})
export class SharedPipesModule {
}
