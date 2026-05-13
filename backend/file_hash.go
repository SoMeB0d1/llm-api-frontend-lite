package main

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
)

func FileHash(messageID int64, fileName string) string {
	hasher := sha256.New()
	_, _ = hasher.Write([]byte(strconv.FormatInt(messageID, 10)))
	_, _ = hasher.Write([]byte{':'})
	_, _ = hasher.Write([]byte(fileName))
	return hex.EncodeToString(hasher.Sum(nil))
}
