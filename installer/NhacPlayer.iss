; Bộ cài Nhạc (Inno Setup 6). Không chạy trực tiếp file này: dùng  python build.py
; build.py truyền vào AppVersion (lấy từ core.VERSION) và SourceDir (thư mục PyInstaller vừa tạo).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\build\dist\NhacPlayer"
#endif
#define AppName "Nhạc"
#define AppExe "NhacPlayer.exe"
#define ProgId "NhacPlayer.Audio"

[Setup]
; AppId cố định: đổi là Windows coi như app khác, cập nhật sẽ thành cài song song
AppId={{4A7797D3-2920-4136-900D-351335968742}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=peo1108
AppPublisherURL=https://github.com/peo1108/music
AppUpdatesURL=https://github.com/peo1108/music/releases
; Cài cho riêng người dùng hiện tại vào %LOCALAPPDATA%\Programs\NhacPlayer: không cần quyền admin
PrivilegesRequired=lowest
DefaultDirName={autopf}\NhacPlayer
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
OutputDir=..\dist
OutputBaseFilename=NhacSetup-{#AppVersion}
SetupIconFile=..\player.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Cập nhật khi app đang mở: tự đóng app (app tự mở lại ở bước [Run])
CloseApplications=force
RestartApplications=no
ChangesAssociations=yes

[Tasks]
Name: "desktopicon"; Description: "Tạo biểu tượng ngoài Desktop"; Flags: unchecked
Name: "tools"; Description: "Cài ffmpeg và Deno qua winget (cần cho phát YouTube, dạng sóng, lưu mp3)"; Check: NeedTools

[InstallDelete]
; Xoá thư viện của bản cũ trước khi chép bản mới, tránh sót file thừa giữa các phiên bản Python/thư viện
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
; Loại file "Tệp nhạc" mở bằng app
Root: HKA; Subkey: "Software\Classes\{#ProgId}"; ValueType: string; ValueData: "Tệp nhạc"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\{#ProgId}\DefaultIcon"; ValueType: string; ValueData: """{app}\{#AppExe}"",0"
Root: HKA; Subkey: "Software\Classes\{#ProgId}\shell\open"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "{#AppName}"
Root: HKA; Subkey: "Software\Classes\{#ProgId}\shell\open\command"; ValueType: string; ValueData: """{app}\{#AppExe}"" ""%1"""
; Hiện trong menu "Mở bằng"
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "{#AppName}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\shell\open\command"; ValueType: string; ValueData: """{app}\{#AppExe}"" ""%1"""
; Đuôi file nhạc mở được bằng app
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".mp3"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\.mp3\OpenWithProgids"; ValueType: string; ValueName: "{#ProgId}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\NhacPlayer\Capabilities\FileAssociations"; ValueType: string; ValueName: ".mp3"; ValueData: "{#ProgId}"
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".m4a"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\.m4a\OpenWithProgids"; ValueType: string; ValueName: "{#ProgId}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\NhacPlayer\Capabilities\FileAssociations"; ValueType: string; ValueName: ".m4a"; ValueData: "{#ProgId}"
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".opus"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\.opus\OpenWithProgids"; ValueType: string; ValueName: "{#ProgId}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\NhacPlayer\Capabilities\FileAssociations"; ValueType: string; ValueName: ".opus"; ValueData: "{#ProgId}"
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".ogg"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\.ogg\OpenWithProgids"; ValueType: string; ValueName: "{#ProgId}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\NhacPlayer\Capabilities\FileAssociations"; ValueType: string; ValueName: ".ogg"; ValueData: "{#ProgId}"
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".flac"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\.flac\OpenWithProgids"; ValueType: string; ValueName: "{#ProgId}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\NhacPlayer\Capabilities\FileAssociations"; ValueType: string; ValueName: ".flac"; ValueData: "{#ProgId}"
Root: HKA; Subkey: "Software\Classes\Applications\{#AppExe}\SupportedTypes"; ValueType: string; ValueName: ".wav"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\.wav\OpenWithProgids"; ValueType: string; ValueName: "{#ProgId}"; ValueData: ""; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\NhacPlayer\Capabilities\FileAssociations"; ValueType: string; ValueName: ".wav"; ValueData: "{#ProgId}"
; Hiện trong Cài đặt > Ứng dụng mặc định
Root: HKA; Subkey: "Software\NhacPlayer"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\NhacPlayer\Capabilities"; ValueType: string; ValueName: "ApplicationName"; ValueData: "{#AppName}"
Root: HKA; Subkey: "Software\NhacPlayer\Capabilities"; ValueType: string; ValueName: "ApplicationDescription"; ValueData: "Trình phát nhạc"
Root: HKA; Subkey: "Software\NhacPlayer\Capabilities"; ValueType: string; ValueName: "ApplicationIcon"; ValueData: """{app}\{#AppExe}"",0"
Root: HKA; Subkey: "Software\RegisteredApplications"; ValueType: string; ValueName: "NhacPlayer"; ValueData: "Software\NhacPlayer\Capabilities"; Flags: uninsdeletevalue

[Run]
Filename: "{cmd}"; Parameters: "/c winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements & winget install -e --id DenoLand.Deno --accept-package-agreements --accept-source-agreements"; StatusMsg: "Đang cài ffmpeg và Deno…"; Tasks: tools; Flags: waituntilterminated
Filename: "ms-settings:defaultapps?registeredAppUser=NhacPlayer"; Description: "Mở Cài đặt để chọn Nhạc làm trình phát mặc định"; Flags: shellexec postinstall skipifsilent unchecked nowait
; Không có skipifsilent: khi tự cập nhật (cài lặng lẽ) thì app tự mở lại
Filename: "{app}\{#AppExe}"; Description: "Mở Nhạc"; Flags: postinstall nowait

[UninstallRun]
Filename: "{cmd}"; Parameters: "/c taskkill /f /im {#AppExe}"; Flags: runhidden; RunOnceId: "KillApp"

[Code]
function ToolMissing(Name: String): Boolean;
begin
  Result := (FileSearch(Name, GetEnv('PATH')) = '') and
            not FileExists(ExpandConstant('{localappdata}\Microsoft\WinGet\Links\') + Name);
end;

function NeedTools(): Boolean;
begin
  Result := ToolMissing('ffmpeg.exe') or ToolMissing('deno.exe');
end;
