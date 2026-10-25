; Desinstalar o Xodó também tira o leitor de sensores (tarefa agendada + pasta em Arquivos de Programas), que foram
; criados como administrador. Na atualização (o instalador novo roda o desinstalador antigo) não mexe em nada.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::ExecToStack 'schtasks /Query /TN "Xodo Sensores"'
    Pop $0
    Pop $1
    ${if} $0 == 0
      ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c schtasks /Delete /TN "Xodo Sensores" /F & taskkill /F /IM XodoSensores.exe & ping -n 2 127.0.0.1 >nul & rmdir /s /q "$PROGRAMFILES64\Xodo"' SW_HIDE
    ${endIf}
  ${endIf}
!macroend
