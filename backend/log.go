package main

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type LOG struct {
	presentlineNum int
	file           *os.File
	mu             sync.Mutex
}

var logurl = "./log/"

var backendlog LOG

const maxLineNum int = 10400

func (this *LOG) initLog() error {
	this.mu.Lock()
	defer this.mu.Unlock()

	if err := this.getPresentFile(); err != nil {
		fmt.Printf("ERROR in initLog: %v\n", err)
		return err
	}
	this.presentlineNum = 0
	return nil
}

func (this *LOG) getPresentFile() error {
	// 确保日志目录存在：不存在则新建，新建失败才报错
	if _, err := os.Stat(logurl); os.IsNotExist(err) {
		if err := os.Mkdir(logurl, 0755); err != nil {
			fmt.Printf("ERROR in getPresentFile: %v\n", err)
			return err
		}
	}

	// 如果当前文件未关闭，先关闭
	if this.file != nil {
		this.file.Close()
		this.file = nil
	}

	// 直接以当前时间戳创建新文件
	newName := time.Now().Format("20060102_150405") + ".log"
	targetPath := filepath.Join(logurl, newName)

	file, err := os.OpenFile(targetPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("ERROR in getPresentFile: %v\n", err)
		return err
	}

	this.file = file
	this.presentlineNum = 0

	//compress check (调用者已持锁，使用无锁版本)
	return this.compressLocked()
}

func (this *LOG) writeLog(str string) error {
	log.Println(str)
	return this.save(str)
}

func (this *LOG) save(str string) error {
	this.mu.Lock()

	if this.file == nil {
		if err := this.getPresentFile(); err != nil {
			this.mu.Unlock()
			return err
		}
	}

	// 追加写入文件末尾
	_, err := this.file.WriteString(str + "\n")
	if err != nil {
		fmt.Printf("ERROR in saveLog: %v\n", err)
		return err
	}
	this.presentlineNum++

	// 超过最大行数则关闭当前文件，创建新的日志文件
	if this.presentlineNum >= maxLineNum {
		this.file.Close()
		this.file = nil

		if err := this.getPresentFile(); err != nil {
			fmt.Printf("ERROR in save: %v\n", err)
			this.mu.Unlock()
			return err
		}
	}

	this.mu.Unlock()
	return nil
}

func (this *LOG) compress() error {
	this.mu.Lock()
	defer this.mu.Unlock()
	return this.compressLocked()
}

func (this *LOG) compressLocked() error {

	entries, err := os.ReadDir(logurl)
	if err != nil {
		fmt.Printf("ERROR in compressLog: %v\n", err)
		return err
	}

	// 收集已关闭的 .log 文件（排除当前正在写入的文件，若无则全部收集）
	var presentName string
	if this.file != nil {
		presentName = filepath.Base(this.file.Name())
	}
	var closedFiles []string
	for _, entry := range entries {
		name := entry.Name()
		if !entry.IsDir() && strings.HasSuffix(name, ".log") && name != presentName {
			closedFiles = append(closedFiles, name)
		}
	}

	// 已关闭的日志文件不足10个时无需压缩
	if len(closedFiles) < 10 {
		return nil
	}

	// 按时间戳排序后取最早的10个
	sort.Strings(closedFiles)
	toCompress := closedFiles[:10]

	// 压缩包名称使用最早的时间戳
	archiveName := strings.TrimSuffix(toCompress[0], ".log") + ".tar.gz"
	archivePath := filepath.Join(logurl, archiveName)

	// 创建 .tar.gz 文件
	outFile, err := os.Create(archivePath)
	if err != nil {
		fmt.Printf("ERROR in compressLog: %v\n", err)
		return err
	}
	defer outFile.Close()

	gw := gzip.NewWriter(outFile)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()

	// 逐个文件写入 tar
	for _, fileName := range toCompress {
		filePath := filepath.Join(logurl, fileName)
		info, err := os.Stat(filePath)
		if err != nil {
			fmt.Printf("ERROR in compressLog: %v\n", err)
			return err
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			fmt.Printf("ERROR in compressLog: %v\n", err)
			return err
		}
		header.Name = fileName

		if err := tw.WriteHeader(header); err != nil {
			fmt.Printf("ERROR in compressLog: %v\n", err)
			return err
		}

		src, err := os.Open(filePath)
		if err != nil {
			fmt.Printf("ERROR in compressLog: %v\n", err)
			return err
		}

		_, err = io.Copy(tw, src)
		src.Close()
		if err != nil {
			fmt.Printf("ERROR in compressLog: %v\n", err)
			return err
		}
	}

	// 删除已压缩的原始日志文件
	for _, f := range toCompress {
		os.Remove(filepath.Join(logurl, f))
	}

	return nil
}
