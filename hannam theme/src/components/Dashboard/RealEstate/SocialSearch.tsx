
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const SocialSearch: React.FC = () => {
  // Chart
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series = [35, 50, 60, 70];

  const options: ApexOptions = {
    plotOptions: {
      radialBar: {
        hollow: {
          size: "40%",
        },
        dataLabels: {
          show: true,
          name: {
            offsetY: -10,
            fontSize: "14px",
            color: "#64748B",
            fontWeight: "400",
          },
          value: {
            show: true,
            color: "#3A4252",
            fontSize: "22px",
            fontWeight: "600",
            offsetY: 3,
          },
          total: {
            show: false,
            fontSize: "14px",
            color: "#64748B",
            fontWeight: "400",
          },
        },
      },
    },
    labels: ["Facebook", "Instagram", "Linkedin", "YouTube"],
    colors: ["#AD63F6", "#3584FC", "#37D80A", "#FD5812"],
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-content">
          <h5 className="!mb-[5px]">Social Search</h5>

          <span className="block text-sm">Total traffic in this week</span>

          <div className="-mb-[23px]">
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="radialBar"
                height={240}
                width={"100%"}
              />
            ) : (
              <div>Loading chart...</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SocialSearch;
