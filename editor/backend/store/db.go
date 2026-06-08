// Package store는 database/sql 기반 DB 연결·영속을 담당한다.
package store

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "modernc.org/sqlite"
)

// Open은 방언에 맞는 드라이버로 DB를 연다.
// dialect: "sqlite" | "mysql". dsn은 각 드라이버 형식.
func Open(dialect, dsn string) (*sql.DB, error) {
	var driver string
	switch dialect {
	case "sqlite":
		driver = "sqlite"
	case "mysql":
		driver = "mysql"
	default:
		return nil, fmt.Errorf("unknown dialect: %s", dialect)
	}
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", dialect, err)
	}
	
	if driver == "mysql" {
		db.SetMaxOpenConns(100)
		db.SetMaxIdleConns(10)
		db.SetConnMaxLifetime(3 * time.Minute)
	}

	return db, nil
}
