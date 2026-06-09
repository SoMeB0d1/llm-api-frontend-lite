package main

import "fmt"

func TestSearch() {
	params := map[string]interface{}{
		"text":   "王宗琪",
		"limit":  5,
		"region": "CN",
		// "begin_date": "",
		// "end_date":   "",
		// "start":      "",
		// "site":       "",
	}
	returnMessage, err := search.Function(params)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	fmt.Println(returnMessage.Content)
}
