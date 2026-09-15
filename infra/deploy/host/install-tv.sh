#!/usr/bin/env sh
set -eu

site_name="tv.moling.fun.conf"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
site_source="$script_dir/$site_name"
acme_source="$script_dir/tv.moling.fun-acme.conf"
available_dir="/etc/nginx/sites-available"
enabled_dir="/etc/nginx/sites-enabled"
enable_mode="symlink"
if [ ! -d "$available_dir" ] || [ ! -d "$enabled_dir" ]; then
    available_dir="/www/server/panel/vhost/nginx"
    enabled_dir="$available_dir"
    enable_mode="inline"
fi
available_path="$available_dir/$site_name"
enabled_path="$enabled_dir/$site_name"
acme_path="$available_dir/tv.moling.fun-acme.conf"
acme_enabled_path="$enabled_dir/tv.moling.fun-acme.conf"
acme_root="/var/www/tv-moling-fun-acme"
certificate_path="/etc/letsencrypt/live/tv.moling.fun/fullchain.pem"
key_path="/etc/letsencrypt/live/tv.moling.fun/privkey.pem"

reload_nginx() {
    if systemctl is-active --quiet nginx; then
        systemctl reload nginx
    else
        nginx -s reload
    fi
}

transaction_active=0
transaction_target=""
transaction_link=""
transaction_target_backup=""
transaction_link_backup=""
transaction_temp=""
transaction_had_target=0
transaction_had_link=0
durable_backup=""

rollback_transaction() {
    if [ "$transaction_active" -ne 1 ]; then return 0; fi
    transaction_active=0
    set +e
    if [ -n "$transaction_target" ]; then
        rm -f "$transaction_target"
        if [ "$transaction_had_target" -eq 1 ]; then
            mv -f "$transaction_target_backup" "$transaction_target"
        fi
    fi
    if [ -n "$transaction_link" ]; then
        rm -f "$transaction_link"
        if [ "$transaction_had_link" -eq 1 ]; then
            mv -f "$transaction_link_backup" "$transaction_link"
        fi
    fi
    if nginx -t >/dev/null 2>&1; then reload_nginx >/dev/null 2>&1 || true; fi
    rm -f "$transaction_target_backup"
    if [ -n "$transaction_temp" ]; then rm -f "$transaction_temp"; fi
    if [ -n "$transaction_link_backup" ]; then rm -f "$transaction_link_backup"; fi
}

clear_transaction() {
    transaction_active=0
    rm -f "$transaction_target_backup"
    if [ -n "$transaction_temp" ]; then rm -f "$transaction_temp"; fi
    if [ -n "$transaction_link_backup" ]; then rm -f "$transaction_link_backup"; fi
    trap - EXIT HUP INT TERM
}

refuse_unrelated_target() {
    target_path="$1"
    if [ -e "$target_path" ] || [ -L "$target_path" ]; then
        if ! grep -q 'server_name tv.moling.fun' "$target_path"; then
            echo "refusing to overwrite unrelated file: $target_path" >&2
            exit 1
        fi
    fi
}

refuse_unrelated_link() {
    link_path="$1"
    target_path="$2"
    if [ -e "$link_path" ] || [ -L "$link_path" ]; then
        if [ ! -L "$link_path" ] || [ "$(readlink -f "$link_path")" != "$(readlink -f "$target_path")" ]; then
            echo "refusing to overwrite unrelated enabled site: $link_path" >&2
            exit 1
        fi
    fi
}

install_site() {
    source_path="$1"
    target_path="$2"
    link_path="$3"
    label="$4"
    if [ "$link_path" = "$target_path" ]; then link_path=""; fi
    refuse_unrelated_target "$target_path"
    if [ "$enable_mode" = "symlink" ]; then refuse_unrelated_link "$link_path" "$target_path"; fi
    durable_backup=""
    if [ -e "$target_path" ] || [ -L "$target_path" ]; then
        durable_backup="$target_path.backup.$(date -u +%Y%m%d%H%M%S).$$"
        cp -p "$target_path" "$durable_backup"
    fi
    temp_path="$target_path.tmp.$$"
    transaction_target="$target_path"
    transaction_link="$link_path"
    transaction_target_backup="$target_path.rollback.$$"
    transaction_link_backup=""
    if [ -n "$link_path" ]; then transaction_link_backup="$link_path.rollback.$$"; fi
    transaction_temp="$temp_path"
    transaction_had_target=0
    transaction_had_link=0
    transaction_active=1
    trap rollback_transaction EXIT HUP INT TERM

    if [ -e "$target_path" ] || [ -L "$target_path" ]; then
        mv -f "$target_path" "$transaction_target_backup"
        transaction_had_target=1
    fi
    if [ "$enable_mode" = "symlink" ] && { [ -e "$link_path" ] || [ -L "$link_path" ]; }; then
        mv -f "$link_path" "$transaction_link_backup"
        transaction_had_link=1
    fi

    install -m 0644 "$source_path" "$temp_path"
    mv -f "$temp_path" "$target_path"
    if [ "$enable_mode" = "symlink" ]; then ln -s "$target_path" "$link_path"; fi
    if ! nginx -t; then
        echo "nginx configuration test failed; restored previous $label" >&2
        rollback_transaction
        exit 1
    fi
    if ! reload_nginx; then
        echo "nginx reload failed; restored previous $label" >&2
        rollback_transaction
        exit 1
    fi
    clear_transaction
    echo "installed and reloaded $label"
    if [ -n "$durable_backup" ]; then
        echo "previous $label saved at $durable_backup"
    fi
}

remove_site() {
    target_path="$1"
    link_path="$2"
    label="$3"
    if [ "$link_path" = "$target_path" ]; then link_path=""; fi
    refuse_unrelated_target "$target_path"
    if [ "$enable_mode" = "symlink" ]; then refuse_unrelated_link "$link_path" "$target_path"; fi
    transaction_target="$target_path"
    transaction_link="$link_path"
    transaction_target_backup="$target_path.rollback.$$"
    transaction_link_backup=""
    if [ -n "$link_path" ]; then transaction_link_backup="$link_path.rollback.$$"; fi
    transaction_temp=""
    transaction_had_target=0
    transaction_had_link=0
    transaction_active=1
    trap rollback_transaction EXIT HUP INT TERM

    if [ -e "$target_path" ] || [ -L "$target_path" ]; then
        mv -f "$target_path" "$transaction_target_backup"
        transaction_had_target=1
    fi
    if [ "$enable_mode" = "symlink" ] && { [ -e "$link_path" ] || [ -L "$link_path" ]; }; then
        mv -f "$link_path" "$transaction_link_backup"
        transaction_had_link=1
    fi
    if ! nginx -t; then
        echo "nginx configuration test failed; restored previous $label" >&2
        rollback_transaction
        exit 1
    fi
    if ! reload_nginx; then
        echo "nginx reload failed; restored previous $label" >&2
        rollback_transaction
        exit 1
    fi
    clear_transaction
    echo "removed and reloaded $label"
}

if [ "$(id -u)" -ne 0 ]; then
    echo "run as root" >&2
    exit 1
fi
if [ ! -f "$site_source" ]; then
    echo "site config not found: $site_source" >&2
    exit 1
fi
if [ ! -d "$available_dir" ] || [ ! -d "$enabled_dir" ]; then
    echo "nginx sites directories are missing" >&2
    exit 1
fi

case "${1:-}" in
    --acme-bootstrap)
        if [ ! -f "$acme_source" ]; then
            echo "ACME site config not found: $acme_source" >&2
            exit 1
        fi
        install -d -m 0755 "$acme_root"
        install_site "$acme_source" "$acme_path" "$acme_enabled_path" "ACME challenge site"
        exit 0
        ;;
    --acme-cleanup)
        remove_site "$acme_path" "$acme_enabled_path" "ACME challenge site"
        exit 0
        ;;
esac

if [ ! -f "$certificate_path" ] || [ ! -f "$key_path" ]; then
    echo "TLS certificate is missing; issue / renew tv.moling.fun before installing this site" >&2
    exit 1
fi

install_site "$site_source" "$available_path" "$enabled_path" "$site_name"
