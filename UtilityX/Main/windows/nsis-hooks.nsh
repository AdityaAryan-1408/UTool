!macro NSIS_HOOK_POSTINSTALL
  ; Versioned Ollumi binaries share one install directory. Remove older
  ; Ollumi_<version>.exe files after the new release binary is in place.
  FindFirst $R0 $R1 "$INSTDIR\Ollumi_*.exe"
  ollumi_remove_previous_binary:
    StrCmp $R1 "" ollumi_remove_previous_binary_done
    StrCmp $R1 "${MAINBINARYNAME}.exe" ollumi_remove_previous_binary_next
    Delete "$INSTDIR\$R1"
  ollumi_remove_previous_binary_next:
    FindNext $R0 $R1
    Goto ollumi_remove_previous_binary
  ollumi_remove_previous_binary_done:
    FindClose $R0
!macroend
