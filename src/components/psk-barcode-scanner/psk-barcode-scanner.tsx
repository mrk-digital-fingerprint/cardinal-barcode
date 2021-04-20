import { Component, Prop, State, Element, h } from '@stencil/core';
import { BindModel, CustomTheme, TableOfContentProperty } from '@cardinal/internals';
import { VideoOverlay } from './overlays';
import audio from './audio';

const INTERVAL_ZXING_LOADED = 300;
const INTERVAL_SCANDIT_LOADED = 300;
const INTERVAL_BETWEEN_SCANS = 2000;
const DELAY_AFTER_RESULT = 500;
const STATUS = {
  IN_PROGRESS: "Camera detection in progress...",
  DONE: "Scan done.",
  NO_DETECTION: "No camera detected."
}

@Component({
  tag: 'psk-barcode-scanner'
})
export class PskBarcodeScanner {

  @BindModel() modelHandler;

  @CustomTheme()

  @Element() element;

  @TableOfContentProperty({
    description: `The data-model that will be updated with the retrieved data from the scanner.`,
    isMandatory: true,
    propertyType: `string`
  })
  @Prop() data: any;

  @TableOfContentProperty({
    description: `A title that will be used for the current component instance.`,
    isMandatory: false,
    propertyType: `string`
  })
  @Prop() title: string = '';
  @Prop() useScandit: boolean = false;

  @State() ScanditSDK = null;
  @State() ZXing = null;
  @State() activeDeviceId: string | null = null;
  @State() status = STATUS.IN_PROGRESS;
  @State() isCameraAvailable = false;

  private codeReader = null;
  private overlay = null;
  private devices = [];
  private isScanDone = false;
  private isComponentDisconnected = false;

  constructor() {
    window.addEventListener('resize', _ => {
      this.cleanupOverlays();
      this.drawOverlays();
      // this.startScanning(this.activeDeviceId);
    });
  }

  private drawOverlays() {
    if (!this.element) {
      return;
    }

    const videoElement = this.element.querySelector('#video');
    const scannerContainer = this.element.querySelector('#scanner-container');

    this.overlay = new VideoOverlay(scannerContainer, videoElement);
    this.overlay.createOverlaysCanvases('lensCanvas', 'overlayCanvas');
    this.overlay.drawLensCanvas();
  }

  private cleanupOverlays() {
    if (this.overlay) {
      this.overlay.removeOverlays();
    }
  }

  private startScanning(deviceId) {
    const videoElement = this.element.querySelector('#video');

    const constraints = {
      video: {
        facingMode: 'environment'
      }
    };

    if (deviceId && deviceId !== 'no-camera') {
      delete constraints.video.facingMode;
      constraints.video['deviceId'] = {
        exact: deviceId
      };
    }

    if (!this.isScanDone) {
      this.cleanupOverlays();
      this.drawOverlays();

      this.codeReader.reset();
      this.codeReader.decodeFromConstraints(constraints, videoElement, (result, err) => {
        if (result && !this.isScanDone) {
          console.log('result', result);

          if (this.modelHandler) {
            audio.play();
            this.overlay.drawOverlay(result.resultPoints);
            this.modelHandler.updateModel('data', result.text);
            this.isScanDone = true;
            this.status = STATUS.DONE;

            setTimeout(_ => {
              this.codeReader.reset();
              this.overlay.removeOverlays();
            }, DELAY_AFTER_RESULT);
          }
        }
        if (err && !(err instanceof this.ZXing.NotFoundException)) {
          console.error(err);
        }
      });
    }
  }

  private switchCamera() {
    let devices = [undefined];

    for (const device of this.devices) {
      devices.push(device.deviceId);
    }

    let currentIndex = devices.indexOf(this.activeDeviceId);
    if (currentIndex === devices.length - 1) {
      currentIndex = -1;
    }
    currentIndex++;

    this.activeDeviceId = devices[currentIndex];
    this.isScanDone = false;
  }

  async componentWillLoad() {
    let tick = () => {
      if (!this.useScandit) {
        if (window['ZXing'] && !this.ZXing && !this.codeReader) {
          this.ZXing = window['ZXing'];
          this.codeReader = new this.ZXing.BrowserMultiFormatReader(null, INTERVAL_BETWEEN_SCANS);
        } else {
          setTimeout(tick, INTERVAL_ZXING_LOADED);
        }
      } else {
        if (window['ScanditSDK'] && !this.ScanditSDK && !this.codeReader) {
          const defaultScanSettings = {
            enabledSymbologies: ["databar-limited", "micropdf417"],
            maxNumberOfCodesPerFrame: 2
          }

          const createNewBarcodePicker = (scanSettings = defaultScanSettings) => {
            return window['ScanditSDK'].BarcodePicker.create(document.getElementById("scandit-barcode-picker"), {
              scanSettings: new window['ScanditSDK'].ScanSettings(scanSettings),
            })
          }

          const newBarcodePickerCallback = (barcodePicker) => {
            // barcodePicker is ready here, show a message every time a barcode is scanned
            barcodePicker.on("scan", (scanResult) => {
              console.log(scanResult)
              if (scanResult.barcodes.length === 2) {
                alert('Composite code scan successfull.')
              }
            });
          }

          this.ScanditSDK = window['ScanditSDK'].configure("api-key", {
            engineLocation: `${this.cardinalPath}/libs/scandit/engine/`,
          })
            .then(() => {
              return createNewBarcodePicker()
            })
            .then(newBarcodePickerCallback);
        }
        else {
          setTimeout(tick, INTERVAL_SCANDIT_LOADED);
        }

      }

    };

    tick();
  }

  async componentWillRender() {
    // ZXing unloaded
    if (!this.useScandit) {
      if (!this.ZXing) {
        return;
      }
    } else {
      if (!this.ScanditSDK) {
        return;
      }
    }

    // No devices yet
    if (this.devices.length === 0 || !this.activeDeviceId) {
      try {
        this.devices = await this.codeReader.listVideoInputDevices();
      } catch (error) {
        // console.error(error);
      }

      if (this.devices.length > 0) {
        this.isCameraAvailable = true;
      } else {
        this.status = STATUS.NO_DETECTION;
      }
    }
  }

  async componentDidRender() {
    if (!this.useScandit) {
      if (this.isCameraAvailable && !this.isComponentDisconnected) {
        this.startScanning(this.activeDeviceId);
      }
    }
  }

  async connectedCallback() {
    this.isComponentDisconnected = false;
  }

  async disconnectedCallback() {
    this.isComponentDisconnected = true;

    if (this.codeReader) {
      this.codeReader.reset();
    }
  }

  get cardinalPath(): string {
    return (window.cardinal && window.cardinal.extended
        ? window.cardinal.extended + '/barcode'
        : 'cardinal/extended/barcode'
    );
  }

  render() {
    const style = {
      barcodeWrapper: {
        display: 'grid', gridTemplateRows: '1fr',
        width: '100%', height: '100%'
      },
      videoWrapper: {
        position: 'relative',
        display: 'grid', gridTemplateRows: '1fr',
        overflow: 'hidden',
        minHeight: '350px',
        padding: '0', margin: '0'
      },
      video: {
        height: '100%', width: '100%',
        objectFit: 'cover'
      },
      input: {
        display: 'none'
      },
      button: {
        position: 'absolute', zIndex: '1',
        padding: '0.3em 0.6em',
        bottom: '1em', left: '50%', transform: 'translateX(-50%)',
        color: '#FFFFFF', background: 'transparent',
        borderRadius: '2px', border: '2px solid rgba(255, 255, 255, 0.75)',
        fontSize: '15px'
      }
    }


    return this.useScandit ? [
      <script async src={`${this.cardinalPath}/libs/scandit/index.min.js`}/>,
      <div id="scandit-barcode-picker" style="max-width: 1280px; max-height: 80%;"></div>

    ] : [
      <script async src={`${this.cardinalPath}/libs/zxing.js`}/>,
      <div title={this.title} style={style.barcodeWrapper}>
        {
          this.isCameraAvailable && !this.isScanDone
            ? (
              <div id="scanner-container" style={style.videoWrapper}>
                <input type="file" accept="video/*" capture="camera" style={style.input}/>
                <video id="video" muted autoplay playsinline={true} style={style.video}/>
                <button onClick={_ => this.switchCamera()} style={style.button}>Change camera</button>
              </div>
            )
            : <div>{this.status}</div>
        }
      </div>
    ];
  }
}
