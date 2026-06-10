package main

import (
	"fmt"

	"github.com/joho/godotenv"
)

var envurl = []string{"./.env", "../.env"}

func loadenv() {
	for _, url := range envurl {
		if err := godotenv.Load(url); err != nil {
			backendlog.writeLog(fmt.Sprintf("DEBUG: Failed to load %s: %v", url, err))
		} else {
			backendlog.writeLog(fmt.Sprintf("DEBUG: Load env success: %s", url))
			return
		}
	}
	backendlog.writeLog("ERROR: Failed to load any env")
}
