package main

import (
	"log"

	"github.com/joho/godotenv"
)

var envurl = []string{"./.env", "../.env"}

func loadenv() {
	for _, url := range envurl {
		if err := godotenv.Load(url); err != nil {
			log.Printf("DEBUG: Failed to load %s: %v\n", url, err)
		} else {
			log.Printf("DEBUG: Load env success: %s\n", url)
			return
		}
	}
	log.Println("ERROR: Failed to load any env")
}
