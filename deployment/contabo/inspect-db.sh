#!/usr/bin/env bash
set -eu

docker exec contabo-db-1 sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -NBe "SELECT user, host, plugin FROM mysql.user"'
docker exec contabo-db-1 sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -unovelhub -NBe "SELECT 1"'
