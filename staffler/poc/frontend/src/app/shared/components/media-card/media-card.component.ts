import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewEncapsulation,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BehaviorSubject, finalize } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DragDropModule } from 'primeng/dragdrop';

import { MediaApiService } from '@dps/core/api';
import { MediaFileSourcePipe } from '@dps/shared/pipes';
import { MediaModel, MediaTypeEnum } from '@dps/shared/models';
import { BYTES_IN_KILOBYTE } from '@dps/shared/constants';
import { ValidationErrors } from '@angular/forms';
import prettyBytes from 'pretty-bytes';

const MAX_FILE_SIZE_IN_BYTES = 5 * BYTES_IN_KILOBYTE * BYTES_IN_KILOBYTE; // 5MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

enum FileValidationErrorNamesEnum {
  SIZE_EXCEEDED = 'maxSize',
  INVALID_TYPE = 'invalidType',
}

@Component({
    selector: 'dps-media-card',
    imports: [
        CommonModule,
        TranslatePipe,
        CardModule,
        ButtonModule,
        MediaFileSourcePipe,
        DragDropModule,
    ],
    templateUrl: './media-card.component.html',
    styleUrl: './media-card.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class MediaCardComponent {
  @Input({ required: true }) label: string = '';
  @Input({ required: true }) media: MediaModel | null = null;
  @Input({ required: true }) mediaType!: MediaTypeEnum;
  @Input() publicUpload = false;

  @Output() mediaUploaded = new EventEmitter<MediaModel>();
  @Output() mediaRemoved = new EventEmitter<MediaModel>();

  readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  readonly inProcess$ = new BehaviorSubject<boolean>(false);
  readonly fileValidationErrorsNameEnum = FileValidationErrorNamesEnum;
  errors: ValidationErrors = {};

  get mediaKey(): string {
    return this.media!.media.key;
  }

  constructor(private mediaApiService: MediaApiService) {}

  fileDropped(event: DragEvent): void {
    const droppedFile = event.dataTransfer?.files[0];
    if (!droppedFile || !this.validateFile(droppedFile)) return;

    this.uploadFile(droppedFile);
  }

  fileSelected(event: any): void {
    const selectedFile = event.target.files[0];
    if (!selectedFile || !this.validateFile(selectedFile)) return;

    this.uploadFile(selectedFile);
  }

  removeFile(): void {
    if (!this.media) return;

    this.inProcess$.next(true);

    this.fileInputRef()!.nativeElement.value = '';
    this.mediaRemoved.emit(this.media as MediaModel);
    this.mediaApiService
      .removeMediaFile(this.mediaKey, this.publicUpload)
      .pipe(finalize(() => this.inProcess$.next(false)))
      .subscribe();
  }

  private uploadFile(file: File): void {
    this.inProcess$.next(true);

    this.mediaApiService
      .uploadMediaFile(file, this.publicUpload)
      .pipe(finalize(() => this.inProcess$.next(false)))
      .subscribe(({ key }) => {
        const uploadedMedia: MediaModel = {
          media: {
            key,
            name: file.name,
          },
          validUntil: null,
          type: this.mediaType,
        };
        this.mediaUploaded.emit(uploadedMedia);
      });
  }

  /**
   *
   * @param file
   * @returns true if file is valid, otherwise false
   */
  private validateFile(file: File): boolean {
    this.errors = {};

    if (file.size > MAX_FILE_SIZE_IN_BYTES) {
      this.errors[FileValidationErrorNamesEnum.SIZE_EXCEEDED] = prettyBytes(
        MAX_FILE_SIZE_IN_BYTES,
        { space: false }
      );
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      this.errors[FileValidationErrorNamesEnum.INVALID_TYPE] = file.type;
    }

    return !Object.keys(this.errors).length;
  }
}
