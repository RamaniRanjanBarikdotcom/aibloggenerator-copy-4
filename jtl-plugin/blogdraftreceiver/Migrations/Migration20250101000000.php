<?php declare(strict_types=1);

namespace Plugin\blogdraftreceiver\Migrations;

use JTL\Plugin\Migration;
use JTL\Update\IMigration;

class Migration20250101000000 extends Migration implements IMigration
{
    public function up()
    {
        $this->execute(
            "CREATE TABLE IF NOT EXISTS `xplugin_blogdraftreceiver_drafts` (\n"
            . "  `id` INT(10) NOT NULL AUTO_INCREMENT,\n"
            . "  `title` VARCHAR(255) NOT NULL,\n"
            . "  `meta_description` TEXT NULL,\n"
            . "  `content` MEDIUMTEXT NOT NULL,\n"
            . "  `keywords` TEXT NULL,\n"
            . "  `status` VARCHAR(50) NOT NULL DEFAULT 'draft',\n"
            . "  `source` VARCHAR(100) NULL,\n"
            . "  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n"
            . "  PRIMARY KEY (`id`)\n"
            . ") ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        );
    }

    public function down()
    {
        $this->execute("DROP TABLE IF EXISTS `xplugin_blogdraftreceiver_drafts`");
    }
}
