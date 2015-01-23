package test

import models._
import org.specs2.mutable._
import play.api.db.slick.Config.driver.simple._
import play.api.db.slick.DB
import play.api.test.Helpers._
import play.api.test._

/**
 * test the kitty cat database
 */
class DBSpec extends Specification {

  "DB" should {
    "work as expected" in new WithApplication {

      //create an instance of the table
      val articles = TableQuery[Articles]
      //see a way to architect your app in the computers-database play-slick sample
      //http://github.com/playframework/play-slick/tree/master/samples/play-slick-sample

      DB.withSession { implicit s: Session =>
        articles.filterNot(_.name === "x").delete
        val testKitties = Seq(
          Article("kit", "black", "img1", "intro", true),
          Article("garfield", "orange", "img1", "intro", true),
          Article("creme puff", "grey", "img1", "intro", true))
        articles.insertAll(testKitties: _*)
        articles.list must equalTo(testKitties)
      }
    }

    "select the correct testing db settings by default" in new WithApplication(FakeApplication(additionalConfiguration = inMemoryDatabase())) {
      DB.withSession { implicit s: Session =>
        s.conn.getMetaData.getURL must startWith("jdbc:h2:mem:play-test")
      }
    }

    "use the default db settings when no other possible options are available" in new WithApplication {
      DB.withSession { implicit s: Session =>
        s.conn.getMetaData.getURL must equalTo("jdbc:h2:mem:play")
      }
    }
  }

}
