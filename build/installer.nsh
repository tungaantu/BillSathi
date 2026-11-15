; Extra NSIS script for the BillSathi installer (included by electron-builder).
; The uninstaller keeps the owner's data (%APPDATA%\BillSathi) unless they tick the box below.
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifdef BUILD_UNINSTALLER
  Var removeUserData
  Var removeDataCheckbox
!endif

; The "un." functions belong to the uninstaller build only.
!ifdef BUILD_UNINSTALLER
  Function un.RemoveDataShow
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 36u "BillSathi will be removed from this computer. Your invoices, parties, items and settings are kept, so you can install BillSathi again later and carry on."
    Pop $0
    ${NSD_CreateCheckbox} 0 46u 100% 24u "Also remove my data (invoices, parties, items and settings). This cannot be undone."
    Pop $removeDataCheckbox
    ${NSD_SetState} $removeDataCheckbox ${BST_UNCHECKED}
    nsDialogs::Show
  FunctionEnd

  Function un.RemoveDataLeave
    ${NSD_GetState} $removeDataCheckbox $removeUserData
  FunctionEnd
!endif

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.RemoveDataShow un.RemoveDataLeave
!macroend

!macro customUnInstall
  ; Only when the person ticked the box, and never during an upgrade.
  ${If} $removeUserData == ${BST_CHECKED}
    ${ifNot} ${isUpdated}
      RMDir /r "$APPDATA\${APP_FILENAME}"
    ${endIf}
  ${endIf}
!macroend
